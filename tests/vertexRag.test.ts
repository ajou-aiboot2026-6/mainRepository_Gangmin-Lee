import { describe, expect, it, vi } from "vitest";
import { VertexRagClient } from "../src/server/cloud/vertexRag.js";

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("VertexRagClient", () => {
  it("creates a corpus with the API-supported managed database defaults", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ ragCorpora: [] }))
      .mockResolvedValueOnce(response({ name: "projects/p/locations/us-central1/operations/create-1" }))
      .mockResolvedValueOnce(response({ done: true, response: { name: "projects/p/locations/us-central1/ragCorpora/c1" } }));
    const client = new VertexRagClient("p", "us-central1", undefined, fetcher, async () => "token");

    await expect(client.ensureCorpus()).resolves.toBe("projects/p/locations/us-central1/ragCorpora/c1");
    const [, createInit] = fetcher.mock.calls[1];
    expect(JSON.parse(String(createInit?.body))).toEqual({
      displayName: "seoul-stay-public-data",
      description: "한국관광공사와 서울 열린데이터를 기반으로 숙소·관광지 추천을 그라운딩하는 코퍼스"
    });
  });

  it("uses the current fixed-size chunking request for GCS imports", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ name: "projects/p/locations/us-central1/operations/import-1" }));
    const client = new VertexRagClient("p", "us-central1", undefined, fetcher, async () => "token");

    await client.importFromGcs("projects/p/locations/us-central1/ragCorpora/c1", "gs://bucket/rag/part-1.md");

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/ragCorpora/c1/ragFiles:import");
    expect(JSON.parse(String(init?.body))).toEqual({
      importRagFilesConfig: {
        gcsSource: { uris: ["gs://bucket/rag/part-1.md"] },
        ragFileTransformationConfig: { ragFileChunkingConfig: { fixedLengthChunking: { chunkSize: 512, chunkOverlap: 100 } } },
        maxEmbeddingRequestsPerMin: 300
      }
    });
  });

  it("sends a retrieval query against the configured corpus", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ contexts: { contexts: [{ text: "성수 숙소 근거" }] } }));
    const corpus = "projects/p/locations/us-central1/ragCorpora/c1";
    const client = new VertexRagClient("p", "us-central1", corpus, fetcher, async () => "token");

    await expect(client.retrieve("성수 숙소", 5)).resolves.toEqual([{ text: "성수 숙소 근거" }]);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1:retrieveContexts");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      vertexRagStore: { ragResources: [{ ragCorpus: corpus }] },
      query: { text: "성수 숙소", ragRetrievalConfig: { topK: 5 } }
    });
  });
});
