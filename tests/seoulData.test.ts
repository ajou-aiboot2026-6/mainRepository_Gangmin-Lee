import { describe, expect, it, vi } from "vitest";
import { SEOUL_DATASETS, SeoulOpenDataClient } from "../src/server/clients/seoulData.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("SeoulOpenDataClient", () => {
  it("parses paginated rows without exposing the API key", async () => {
    const dataset = SEOUL_DATASETS[0];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      [dataset.service]: { list_total_count: 739783, RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" }, row: [{ ADSTRD_CD_NM: "성수1가1동" }] }
    }));
    const client = new SeoulOpenDataClient("secret-key", fetcher);
    const result = await client.page(dataset, 1, 1000);
    expect(result).toEqual({ totalCount: 739783, rows: [{ ADSTRD_CD_NM: "성수1가1동" }] });
    expect(String(fetcher.mock.calls[0][0])).toContain("/json/VwsmAdstrdStorW/1/1000");
  });

  it("surfaces provider errors instead of returning demo rows", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ RESULT: { CODE: "ERROR-301", MESSAGE: "인증키가 유효하지 않습니다" } }));
    const client = new SeoulOpenDataClient("bad-key", fetcher);
    await expect(client.page(SEOUL_DATASETS[0], 1, 5)).rejects.toMatchObject({ code: "SEOUL_DATA_API_ERROR" });
  });
});
