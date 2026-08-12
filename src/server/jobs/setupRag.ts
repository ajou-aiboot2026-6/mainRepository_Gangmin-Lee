import { loadConfig } from "../config.js";
import { VertexRagClient } from "../cloud/vertexRag.js";

const config = loadConfig();
if (!config.googleCloudProject || !config.gcsRawBucket) throw new Error("GOOGLE_CLOUD_PROJECT와 GCS_RAW_BUCKET이 필요합니다.");
const rag = new VertexRagClient(config.googleCloudProject, config.googleCloudLocation);
const corpus = await rag.ensureCorpus();
const source = process.env.RAG_GCS_URI?.trim() || `gs://${config.gcsRawBucket}/rag/`;
const operation = await rag.importFromGcs(corpus, source);
console.log(JSON.stringify({ corpus, source, importOperation: operation.name }));
