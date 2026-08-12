import express from "express";
import path from "node:path";
import { z } from "zod";
import { AppError, assertConfigured, configurationStatus, type AppConfig } from "./config.js";
import { GeminiClient } from "./clients/gemini.js";
import { GoogleMapsClient } from "./clients/googleMaps.js";
import { TourApiClient } from "./clients/tour.js";
import { RecommendationService } from "./services/recommender.js";
import type { VisitPlace } from "./types.js";
import { VertexRagClient } from "./cloud/vertexRag.js";
import { DataPlatform } from "./cloud/dataPlatform.js";
import { randomUUID } from "node:crypto";

const analysisRequest = z.object({ message: z.string().trim().min(2).max(1000) });
const preferenceRequest = z.object({ message: z.string().trim().min(1).max(500) });
const visitSchema = z.object({
  id: z.string(), query: z.string(), name: z.string(), category: z.string(), address: z.string(),
  lat: z.number(), lng: z.number(), placeUrl: z.string().optional(),
  stayMinutes: z.number().int().min(15).max(480), stayRationale: z.string()
});
const recommendationRequest = z.object({
  visits: z.array(visitSchema).min(1).max(8),
  filters: z.object({ accommodationTypes: z.array(z.string()).max(5), moods: z.array(z.string()).max(6) })
});

export function createApp(config: AppConfig) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_req, res) => {
    const services = configurationStatus(config);
    const ready = services.gemini && services.googleMaps && services.tourApi;
    res.json({ status: ready ? "ready" : "configuration_required", services, demoData: false });
  });

  app.post("/api/itinerary/analyze", async (req, res, next) => {
    try {
      assertConfigured(config, ["gemini", "googleMaps"]);
      const { message } = analysisRequest.parse(req.body);
      const gemini = createGemini(config);
      const googleMaps = new GoogleMapsClient(config.googleMapsApiKey!);
      const analysis = await gemini.analyzeItinerary(message);
      const places: VisitPlace[] = [];
      for (const [index, proposal] of analysis.places.entries()) {
        const match = await googleMaps.searchPlace(proposal.query);
        places.push({
          id: `${match.id}-${index}`, query: proposal.query, name: match.name,
          category: proposal.category || match.category, address: match.address,
          lat: match.lat, lng: match.lng, placeUrl: match.placeUrl,
          stayMinutes: proposal.estimatedStayMinutes, stayRationale: proposal.rationale
        });
      }
      res.json({ assistantMessage: analysis.assistantMessage, places });
    } catch (error) { next(error); }
  });

  app.post("/api/preferences/analyze", async (req, res, next) => {
    try {
      assertConfigured(config, ["gemini"]);
      const { message } = preferenceRequest.parse(req.body);
      const gemini = createGemini(config);
      res.json(await gemini.analyzePreferences(message));
    } catch (error) { next(error); }
  });

  app.post("/api/recommendations", async (req, res, next) => {
    try {
      assertConfigured(config, ["gemini", "googleMaps", "tourApi"]);
      const input = recommendationRequest.parse(req.body);
      const service = new RecommendationService(
        new TourApiClient(config.tourApiServiceKey!),
        new GoogleMapsClient(config.googleMapsApiKey!),
        createGemini(config),
        createRag(config)
      );
      const recommendations = await service.recommend(input.visits, input.filters);
      const dataPlatform = createDataPlatform(config);
      if (dataPlatform) void dataPlatform.logRecommendation({
        eventId: randomUUID(), createdAt: new Date(),
        visitNames: input.visits.map((visit) => visit.name), stayMinutes: input.visits.map((visit) => visit.stayMinutes),
        accommodationTypes: input.filters.accommodationTypes, moods: input.filters.moods,
        recommendedStayIds: recommendations.map((stay) => stay.id), recommendedStayNames: recommendations.map((stay) => stay.name)
      }).catch((error) => console.error("BigQuery recommendation event logging failed", error));
      res.json({ recommendations, methodology: {
        weights: "장소별 체류시간 / 총 체류시간",
        effectiveMode: "장소별 Google 대중교통과 도보 추정값 중 소요시간이 짧은 수단",
        score: "가중 평균 이동시간 + 최장 이동시간 15% + 환승 부담 + 분위기 검색 보정",
        disclaimer: "대중교통은 Google Routes API 예상값입니다. 서울 도보 경로가 제공되지 않으면 실제 좌표 직선거리×1.25, 시속 4.5km로 추정하며 가격·객실 재고는 제공하지 않습니다."
      } });
    } catch (error) { next(error); }
  });

  // The compiled server lives in dist-server, while Cloud Run starts it with
  // the application root as the working directory.
  const clientDir = path.resolve(process.cwd(), "dist-client");
  app.use(express.static(clientDir));
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(clientDir, "index.html"));
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "입력값을 확인해 주세요.", details: error.issues } });
    if (error instanceof AppError) return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    console.error(error);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "예상하지 못한 오류가 발생했습니다." } });
  });
  return app;
}

function createGemini(config: AppConfig) {
  const vertex = config.useVertexAi && config.googleCloudProject
    ? { project: config.googleCloudProject, location: config.googleCloudLocation }
    : undefined;
  return new GeminiClient(config.geminiApiKey, config.geminiModel, config.embeddingModel, vertex);
}

function createRag(config: AppConfig) {
  if (!config.googleCloudProject || !config.ragCorpus) return undefined;
  return new VertexRagClient(config.googleCloudProject, config.googleCloudLocation, config.ragCorpus);
}

function createDataPlatform(config: AppConfig) {
  if (!config.googleCloudProject || !config.gcsRawBucket) return undefined;
  return new DataPlatform({
    projectId: config.googleCloudProject, bucketName: config.gcsRawBucket,
    datasetId: config.bigQueryDataset, bigQueryLocation: config.bigQueryLocation
  });
}
