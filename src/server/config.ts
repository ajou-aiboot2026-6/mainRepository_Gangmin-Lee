import "dotenv/config";

export type AppConfig = {
  geminiApiKey?: string;
  geminiModel: string;
  embeddingModel: string;
  googleMapsApiKey?: string;
  tourApiServiceKey?: string;
  seoulOpenDataApiKey?: string;
  googleCloudProject?: string;
  googleCloudLocation: string;
  useVertexAi: boolean;
  gcsRawBucket?: string;
  bigQueryDataset: string;
  bigQueryLocation: string;
  ragCorpus?: string;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    geminiModel: env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    embeddingModel: env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001",
    googleMapsApiKey: env.GOOGLE_MAPS_API_KEY?.trim() || undefined,
    tourApiServiceKey: env.TOUR_API_SERVICE_KEY?.trim() || undefined,
    seoulOpenDataApiKey: env.SEOUL_OPEN_DATA_API_KEY?.trim() || undefined,
    googleCloudProject: env.GOOGLE_CLOUD_PROJECT?.trim() || undefined,
    googleCloudLocation: env.GOOGLE_CLOUD_LOCATION?.trim() || "us-central1",
    useVertexAi: env.GOOGLE_GENAI_USE_VERTEXAI?.trim().toLowerCase() === "true",
    gcsRawBucket: env.GCS_RAW_BUCKET?.trim() || undefined,
    bigQueryDataset: env.BIGQUERY_DATASET?.trim() || "seoul_stay_mvp",
    bigQueryLocation: env.BIGQUERY_LOCATION?.trim() || "US",
    ragCorpus: env.VERTEX_RAG_CORPUS?.trim() || undefined,
    port: Number(env.PORT || 8080)
  };
}

export function configurationStatus(config: AppConfig) {
  return {
    gemini: Boolean(config.geminiApiKey || (config.useVertexAi && config.googleCloudProject)),
    googleMaps: Boolean(config.googleMapsApiKey),
    tourApi: Boolean(config.tourApiServiceKey),
    seoulData: Boolean(config.seoulOpenDataApiKey),
    vertexAi: Boolean(config.googleCloudProject && config.useVertexAi),
    dataPlatform: Boolean(config.googleCloudProject && config.gcsRawBucket)
  };
}

export function assertConfigured(config: AppConfig, keys: (keyof ReturnType<typeof configurationStatus>)[]) {
  const status = configurationStatus(config);
  const missing = keys.filter((key) => !status[key]);
  if (missing.length) {
    const names = {
      gemini: "GEMINI_API_KEY", googleMaps: "GOOGLE_MAPS_API_KEY", tourApi: "TOUR_API_SERVICE_KEY",
      seoulData: "SEOUL_OPEN_DATA_API_KEY", vertexAi: "GOOGLE_CLOUD_PROJECT + GOOGLE_GENAI_USE_VERTEXAI=true",
      dataPlatform: "GOOGLE_CLOUD_PROJECT + GCS_RAW_BUCKET"
    };
    throw new AppError(503, "CONFIGURATION_REQUIRED", `필수 API 키가 설정되지 않았습니다: ${missing.map((key) => names[key]).join(", ")}`);
  }
}

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
