import { GoogleAuth } from "google-auth-library";
import { AppError } from "../config.js";

export type RagContext = { text: string; sourceUri?: string; sourceDisplayName?: string; distance?: number };

export class VertexRagClient {
  private readonly auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  constructor(
    private readonly projectId: string,
    private readonly location: string,
    private readonly corpus?: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly accessTokenProvider: () => Promise<string | null | undefined> = () => this.auth.getAccessToken()
  ) {}

  async ensureCorpus(displayName = "seoul-stay-public-data") {
    const parent = `projects/${this.projectId}/locations/${this.location}`;
    const list = await this.request<{ ragCorpora?: Array<{ name: string; displayName?: string }> }>(`/v1/${parent}/ragCorpora`, { method: "GET" });
    const existing = list.ragCorpora?.find((item) => item.displayName === displayName);
    if (existing) return existing.name;
    const operation = await this.request<{ name: string }>(`/v1/${parent}/ragCorpora`, {
      method: "POST",
      body: JSON.stringify({
        displayName,
        description: "한국관광공사와 서울 열린데이터를 기반으로 숙소·관광지 추천을 그라운딩하는 코퍼스"
      })
    });
    const completed = await this.waitOperation(operation.name);
    const corpus = completed.response as { name?: string } | undefined;
    if (!corpus?.name) throw new AppError(502, "RAG_CORPUS_ERROR", "RAG 코퍼스 생성 결과를 확인할 수 없습니다.", completed);
    return corpus.name;
  }

  async importFromGcs(corpus: string, gcsUri: string) {
    return this.request<{ name: string }>(`/v1/${corpus}/ragFiles:import`, {
      method: "POST",
      body: JSON.stringify({ importRagFilesConfig: {
        gcsSource: { uris: [gcsUri] },
        ragFileTransformationConfig: { ragFileChunkingConfig: { fixedLengthChunking: { chunkSize: 512, chunkOverlap: 100 } } },
        maxEmbeddingRequestsPerMin: 300
      } })
    });
  }

  async retrieve(query: string, topK = 8): Promise<RagContext[]> {
    if (!this.corpus) return [];
    const parent = `projects/${this.projectId}/locations/${this.location}`;
    const data = await this.request<{ contexts?: { contexts?: RagContext[] } }>(`/v1/${parent}:retrieveContexts`, {
      method: "POST",
      body: JSON.stringify({
        vertexRagStore: { ragResources: [{ ragCorpus: this.corpus }] },
        query: { text: query, ragRetrievalConfig: { topK } }
      })
    });
    return data.contexts?.contexts || [];
  }

  private async waitOperation(name: string) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const operation = await this.request<{ done?: boolean; error?: unknown; response?: unknown }>(`/v1/${name}`, { method: "GET" });
      if (operation.error) throw new AppError(502, "RAG_OPERATION_ERROR", "Vertex AI RAG 작업이 실패했습니다.", operation.error);
      if (operation.done) return operation;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new AppError(504, "RAG_OPERATION_TIMEOUT", "Vertex AI RAG 작업 완료를 기다리다 시간이 초과되었습니다.");
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const token = await this.accessTokenProvider();
    if (!token) throw new AppError(401, "VERTEX_RAG_AUTH_ERROR", "Vertex AI 인증 토큰을 가져올 수 없습니다.");
    const response = await this.fetcher(`https://${this.location}-aiplatform.googleapis.com${path}`, {
      ...init, headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) }
    });
    const data = await response.json().catch(() => undefined);
    if (!response.ok) throw new AppError(response.status, "VERTEX_RAG_API_ERROR", `Vertex AI RAG API 호출에 실패했습니다 (${response.status}).`, data);
    return data as T;
  }
}
