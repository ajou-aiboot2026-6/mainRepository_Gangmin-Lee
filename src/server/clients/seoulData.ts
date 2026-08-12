import { AppError } from "../config.js";

export type SeoulDataset = {
  id: string;
  service: string;
  description: string;
};

export const SEOUL_DATASETS: SeoulDataset[] = [
  { id: "commercial_stores", service: "VwsmAdstrdStorW", description: "행정동별 업종·점포·개폐업 현황" },
  { id: "commercial_population", service: "VwsmTrdarFlpopQq", description: "상권별 시간대·요일·성별 유동인구" },
  { id: "commercial_sales", service: "VwsmTrdhlSelngQq", description: "상권 배후지별 업종 추정매출" }
];

export class SeoulOpenDataClient {
  private readonly baseUrl = "http://openapi.seoul.go.kr:8088";
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {}

  async page(dataset: SeoulDataset, start: number, end: number) {
    const url = `${this.baseUrl}/${encodeURIComponent(this.apiKey)}/json/${dataset.service}/${start}/${end}`;
    const response = await this.fetcher(url);
    if (!response.ok) throw new AppError(response.status, "SEOUL_DATA_API_ERROR", `서울 열린데이터 호출에 실패했습니다 (${response.status}).`);
    const body = await response.json() as Record<string, unknown>;
    const payload = body[dataset.service] as { list_total_count?: number; RESULT?: { CODE?: string; MESSAGE?: string }; row?: Record<string, unknown>[] } | undefined;
    if (!payload) {
      const error = body.RESULT as { CODE?: string; MESSAGE?: string } | undefined;
      throw new AppError(502, "SEOUL_DATA_API_ERROR", error?.MESSAGE || `${dataset.service} 응답 형식을 확인할 수 없습니다.`, body);
    }
    if (payload.RESULT?.CODE && payload.RESULT.CODE !== "INFO-000") {
      throw new AppError(502, "SEOUL_DATA_API_ERROR", payload.RESULT.MESSAGE || `${dataset.service}가 오류를 반환했습니다.`, payload.RESULT);
    }
    return { rows: payload.row || [], totalCount: Number(payload.list_total_count || 0) };
  }
}
