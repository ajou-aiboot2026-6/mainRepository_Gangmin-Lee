import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AppError } from "../config.js";
import type { Accommodation, RankedAccommodation } from "../types.js";
import type { RagContext } from "../cloud/vertexRag.js";

const itinerarySchema = z.object({
  assistantMessage: z.string(),
  places: z.array(z.object({
    query: z.string().min(1),
    category: z.string().min(1),
    estimatedStayMinutes: z.number().int().min(15).max(480),
    rationale: z.string().min(1)
  })).min(1).max(8)
});

const explanationSchema = z.object({
  recommendations: z.array(z.object({
    id: z.string(), summary: z.string(), fitReasons: z.array(z.string()).max(3), caveat: z.string()
  }))
});

const preferenceSchema = z.object({
  assistantMessage: z.string(),
  accommodationTypes: z.array(z.enum(["호텔", "게스트하우스·호스텔", "한옥", "레지던스·스테이", "모텔"])).max(5),
  moods: z.array(z.string().min(1)).max(6)
});

export class GeminiClient {
  private readonly ai: GoogleGenAI;
  constructor(apiKey: string | undefined, private readonly model: string, private readonly embeddingModel: string, vertex?: { project: string; location: string }) {
    this.ai = vertex
      ? new GoogleGenAI({ vertexai: true, project: vertex.project, location: vertex.location })
      : new GoogleGenAI({ apiKey: apiKey! });
  }

  async analyzeItinerary(message: string) {
    const prompt = `너는 서울 여행 일정 분석가다. 사용자의 문장에서 실제로 방문하려는 장소·매장·활동을 분리하고 각 장소의 현실적인 체류시간을 분 단위로 추정하라.
규칙:
- 장소 검색이 가능한 구체적인 query를 만든다. 지역만 언급하고 업종만 있다면 "성수동 카페"처럼 유지한다.
- 체류시간은 카페 60~120분, 식사 60~90분, 쇼핑 45~120분, 전시 90~180분을 참고하되 문맥에 맞춘다.
- 이동시간은 체류시간에 포함하지 않는다.
- 사용자에게 추정값을 수정할 수 있다고 짧게 알린다.
사용자 입력: ${message}`;
    const json = await this.generateJson(prompt, {
      type: "object", required: ["assistantMessage", "places"],
      properties: {
        assistantMessage: { type: "string" },
        places: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", required: ["query", "category", "estimatedStayMinutes", "rationale"], properties: {
          query: { type: "string" }, category: { type: "string" }, estimatedStayMinutes: { type: "integer", minimum: 15, maximum: 480 }, rationale: { type: "string" }
        } } }
      }
    });
    return itinerarySchema.parse(json);
  }

  async analyzePreferences(message: string) {
    const prompt = `너는 서울 숙소 추천 챗봇이다. 사용자의 답변에서 숙소 유형과 원하는 분위기를 추출하라.
허용 숙소 유형: 호텔, 게스트하우스·호스텔, 한옥, 레지던스·스테이, 모텔.
규칙:
- 사용자가 상관없음, 아무거나, 추천해줘라고 하면 숙소 유형과 분위기를 빈 배열로 둔다.
- 분위기는 사용자의 표현을 짧은 한국어 구문으로 최대 6개까지 유지한다.
- 가격, 예약 가능 여부, 시설은 추측하지 않는다.
- assistantMessage에는 이해한 조건과 이제 동선을 계산하겠다는 내용을 한두 문장으로 말한다.
사용자 답변: ${message}`;
    const json = await this.generateJson(prompt, {
      type: "object", required: ["assistantMessage", "accommodationTypes", "moods"],
      properties: {
        assistantMessage: { type: "string" },
        accommodationTypes: { type: "array", maxItems: 5, items: { type: "string", enum: ["호텔", "게스트하우스·호스텔", "한옥", "레지던스·스테이", "모텔"] } },
        moods: { type: "array", maxItems: 6, items: { type: "string" } }
      }
    });
    return preferenceSchema.parse(json);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    try {
      // Vertex AI's embedContent endpoint accepts one content per request for
      // this model. Keep limited parallelism so a mood search does not exceed
      // the endpoint contract or create a sudden quota spike.
      return await mapWithConcurrency(texts, 4, async (text) => {
        const response = await this.ai.models.embedContent({
          model: this.embeddingModel,
          contents: [{ parts: [{ text }] }],
          config: { outputDimensionality: 768 }
        });
        const vector = response.embeddings?.[0]?.values || [];
        if (!vector.length) {
          throw new AppError(502, "EMBEDDING_ERROR", "숙소 설명 임베딩을 생성하지 못했습니다.");
        }
        return vector;
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        502,
        "EMBEDDING_API_ERROR",
        "숙소 분위기 분석 중 임베딩 API 호출에 실패했습니다.",
        error instanceof Error ? error.message : error
      );
    }
  }

  async explainRecommendations(items: RankedAccommodation[], requestedMoods: string[], ragContexts: RagContext[] = []) {
    const compact = items.map((item) => ({
      id: item.id, name: item.name, address: item.address, type: item.accommodationType,
      overview: item.overview.slice(0, 900), moods: item.moodTags,
      weightedTravelMinutes: item.weightedTravelMinutes, worstTravelMinutes: item.worstTravelMinutes,
      routes: item.routes.map((route) => ({ place: route.visitName, weight: route.weight, transit: route.transit?.durationMinutes, walk: route.walk?.durationMinutes, selected: route.bestMode }))
    }));
    const grounding = ragContexts.slice(0, 8).map((context, index) => ({ index: index + 1, text: context.text, source: context.sourceUri }));
    const prompt = `너는 서울 숙소 추천 설명가다. 아래 수치와 공식 숙소 설명, 검색된 공공데이터 근거만 사용하라. 가격·예약 가능 여부·시설을 추측하지 마라.
사용자가 원하는 분위기: ${requestedMoods.join(", ") || "지정 없음"}
후보(JSON): ${JSON.stringify(compact)}
RAG 공공데이터 근거(JSON): ${JSON.stringify(grounding)}
각 후보마다 2문장 요약, 최대 3개 적합 이유, 확인이 필요한 한계를 작성하라. 이동시간은 예상치임을 명시하고 설명에 없는 분위기 특성은 단정하지 마라.`;
    const json = await this.generateJson(prompt, {
      type: "object", required: ["recommendations"], properties: {
        recommendations: { type: "array", items: { type: "object", required: ["id", "summary", "fitReasons", "caveat"], properties: {
          id: { type: "string" }, summary: { type: "string" }, fitReasons: { type: "array", items: { type: "string" }, maxItems: 3 }, caveat: { type: "string" }
        } } }
      }
    });
    return explanationSchema.parse(json).recommendations;
  }

  private async generateJson(prompt: string, schema: unknown) {
    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: { responseMimeType: "application/json", responseJsonSchema: schema }
      });
      if (!response.text) throw new Error("empty response");
      return JSON.parse(response.text);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "GEMINI_API_ERROR", "Gemini 응답을 처리하지 못했습니다.", error instanceof Error ? error.message : error);
    }
  }
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

export function moodTagsFromOverview(item: Accommodation, requested: string[]) {
  const haystack = `${item.name} ${item.overview}`.toLowerCase();
  return requested.filter((mood) => haystack.includes(mood.toLowerCase()));
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await task(items[index]);
    }
  }));
  return output;
}
