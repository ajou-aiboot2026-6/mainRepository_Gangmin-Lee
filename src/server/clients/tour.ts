import { AppError } from "../config.js";
import type { Accommodation } from "../types.js";

type TourItem = {
  contentid: string; title: string; addr1?: string; mapx?: string; mapy?: string;
  firstimage?: string; firstimage2?: string; overview?: string; homepage?: string;
};

export type TourRawItem = TourItem & Record<string, unknown>;

export class TourApiClient {
  private readonly baseUrl = "https://apis.data.go.kr/B551011/KorService2";
  constructor(private readonly serviceKey: string, private readonly fetcher: typeof fetch = fetch) {}

  private async call(operation: string, params: Record<string, string>) {
    const url = new URL(`${this.baseUrl}/${operation}`);
    url.searchParams.set("serviceKey", normalizeServiceKey(this.serviceKey));
    url.searchParams.set("MobileOS", "ETC");
    url.searchParams.set("MobileApp", "SeoulStayPathfinder");
    url.searchParams.set("_type", "json");
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await this.fetcher(url);
    if (!response.ok) throw new AppError(response.status, "TOUR_API_ERROR", `TourAPI 호출에 실패했습니다 (${response.status}).`);
    const data = await response.json() as any;
    const header = data?.response?.header;
    if (header?.resultCode && header.resultCode !== "0000") {
      throw new AppError(502, "TOUR_API_ERROR", header.resultMsg || "TourAPI가 오류를 반환했습니다.", header);
    }
    return data?.response?.body;
  }

  async listSeoulStays(limit = 120): Promise<Accommodation[]> {
    const body = await this.call("searchStay2", { areaCode: "1", numOfRows: String(limit), pageNo: "1", arrange: "A" });
    const raw = body?.items?.item;
    const items: TourItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return items.filter((item) => item.mapx && item.mapy).map((item) => ({
      id: item.contentid,
      name: cleanText(item.title),
      address: cleanText(item.addr1 || "서울"),
      lat: Number(item.mapy),
      lng: Number(item.mapx),
      imageUrl: item.firstimage || item.firstimage2 || undefined,
      sourceUrl: `https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=${encodeURIComponent(item.contentid)}`,
      overview: "",
      accommodationType: inferType(item.title),
      moodTags: [],
      moodSimilarity: 0
    }));
  }

  async listAllContentPage(pageNo: number, numOfRows = 1000) {
    const body = await this.call("areaBasedList2", {
      numOfRows: String(numOfRows), pageNo: String(pageNo), arrange: "A"
    });
    const raw = body?.items?.item;
    const items: TourRawItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return { items, totalCount: Number(body?.totalCount || items.length) };
  }

  async getOverview(contentId: string): Promise<string> {
    const body = await this.call("detailCommon2", { contentId, defaultYN: "Y", overviewYN: "Y", firstImageYN: "N", addrinfoYN: "N", mapinfoYN: "N" });
    const raw = body?.items?.item;
    const item: TourItem | undefined = Array.isArray(raw) ? raw[0] : raw;
    return cleanText(item?.overview || "공식 상세 설명이 제공되지 않았습니다.");
  }
}

function normalizeServiceKey(key: string) {
  try { return key.includes("%") ? decodeURIComponent(key) : key; } catch { return key; }
}

function cleanText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function inferType(title: string) {
  const value = title.toLowerCase();
  if (/게스트|guest|호스텔|hostel/.test(value)) return "게스트하우스·호스텔";
  if (/한옥|hanok/.test(value)) return "한옥";
  if (/레지던스|residence|스테이|stay/.test(value)) return "레지던스·스테이";
  if (/모텔|motel/.test(value)) return "모텔";
  return "호텔";
}
