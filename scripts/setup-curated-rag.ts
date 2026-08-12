import { VertexRagClient } from "../src/server/cloud/vertexRag.js";

const projectId = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
const gcsUri = process.env.RAG_GCS_URI;
const displayName = process.env.RAG_DISPLAY_NAME || "seoul-stay-tourism-rag";

if (!projectId || !gcsUri) {
  throw new Error("GOOGLE_CLOUD_PROJECT and RAG_GCS_URI are required.");
}

const client = new VertexRagClient(projectId, location);
const corpus = await client.ensureCorpus(displayName);
const operation = await client.importFromGcs(corpus, gcsUri);

console.log(JSON.stringify({ corpus, importOperation: operation.name, gcsUri }));
