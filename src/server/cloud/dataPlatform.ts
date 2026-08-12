import { BigQuery, type JobLoadMetadata, type TableField } from "@google-cloud/bigquery";
import { Storage } from "@google-cloud/storage";

export type DataPlatformOptions = {
  projectId: string;
  bucketName: string;
  datasetId: string;
  bigQueryLocation: string;
};

export const RAW_TABLE_SCHEMA: TableField[] = [
  { name: "payload", type: "STRING", mode: "REQUIRED" },
  { name: "_source", type: "STRING", mode: "REQUIRED" },
  { name: "_ingested_at", type: "TIMESTAMP", mode: "REQUIRED" }
];

export function toRawStorageRow(row: Record<string, unknown>, source: string, ingestedAt: Date) {
  return {
    payload: JSON.stringify(row),
    _source: source,
    _ingested_at: ingestedAt.toISOString()
  };
}

export function rawLoadMetadata(part: number, location: string): JobLoadMetadata {
  return {
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    autodetect: false,
    schema: { fields: RAW_TABLE_SCHEMA },
    writeDisposition: part === 1 ? "WRITE_TRUNCATE" : "WRITE_APPEND",
    location
  };
}

export class DataPlatform {
  private readonly storage: Storage;
  private readonly bigQuery: BigQuery;
  constructor(private readonly options: DataPlatformOptions) {
    this.storage = new Storage({ projectId: options.projectId });
    this.bigQuery = new BigQuery({ projectId: options.projectId });
  }

  async ensureInfrastructure() {
    const bucket = this.storage.bucket(this.options.bucketName);
    const [bucketExists] = await bucket.exists();
    if (!bucketExists) await this.storage.createBucket(this.options.bucketName, { location: this.options.bigQueryLocation, uniformBucketLevelAccess: true });
    const dataset = this.bigQuery.dataset(this.options.datasetId);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) await this.bigQuery.createDataset(this.options.datasetId, { location: this.options.bigQueryLocation });
    const runs = dataset.table("ingestion_runs");
    const [runsExists] = await runs.exists();
    if (!runsExists) await runs.create({ schema: [
      { name: "run_id", type: "STRING", mode: "REQUIRED" },
      { name: "source", type: "STRING", mode: "REQUIRED" },
      { name: "object_uri", type: "STRING", mode: "REQUIRED" },
      { name: "row_count", type: "INTEGER", mode: "REQUIRED" },
      { name: "started_at", type: "TIMESTAMP", mode: "REQUIRED" },
      { name: "completed_at", type: "TIMESTAMP", mode: "REQUIRED" }
    ] });
    const events = dataset.table("recommendation_events");
    const [eventsExists] = await events.exists();
    if (!eventsExists) await events.create({ schema: [
      { name: "event_id", type: "STRING", mode: "REQUIRED" },
      { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
      { name: "visit_names", type: "STRING", mode: "REPEATED" },
      { name: "stay_minutes", type: "INTEGER", mode: "REPEATED" },
      { name: "accommodation_types", type: "STRING", mode: "REPEATED" },
      { name: "moods", type: "STRING", mode: "REPEATED" },
      { name: "recommended_stay_ids", type: "STRING", mode: "REPEATED" },
      { name: "recommended_stay_names", type: "STRING", mode: "REPEATED" }
    ], timePartitioning: { type: "DAY", field: "created_at" } });
  }

  async saveAndLoad(source: string, rows: Record<string, unknown>[], startedAt: Date, part = 1) {
    if (!rows.length) return { source, rowCount: 0, objectUri: "" };
    const runId = `${startedAt.toISOString().replace(/[:.]/g, "-")}-${source}-p${String(part).padStart(5, "0")}`;
    const objectName = `raw/${source}/${startedAt.toISOString().slice(0, 10)}/${runId}.jsonl`;
    const file = this.storage.bucket(this.options.bucketName).file(objectName);
    const enriched = rows
      .map((row) => JSON.stringify(toRawStorageRow(row, source, startedAt)))
      .join("\n") + "\n";
    await file.save(enriched, { contentType: "application/x-ndjson", resumable: false });
    const uri = `gs://${this.options.bucketName}/${objectName}`;
    const table = this.bigQuery.dataset(this.options.datasetId).table(`raw_${sanitizeIdentifier(source)}`);
    await table.load(file, rawLoadMetadata(part, this.options.bigQueryLocation));
    const completedAt = new Date();
    await this.bigQuery.dataset(this.options.datasetId).table("ingestion_runs").insert([{
      run_id: runId, source, object_uri: uri, row_count: rows.length,
      started_at: startedAt.toISOString(), completed_at: completedAt.toISOString()
    }]);
    return { source, rowCount: rows.length, objectUri: uri };
  }

  async saveRagMarkdown(source: string, rows: Record<string, unknown>[], startedAt: Date, batchSize = 100, partOffset = 0) {
    const prefix = `rag/${source}/${startedAt.toISOString().slice(0, 10)}`;
    const bucket = this.storage.bucket(this.options.bucketName);
    for (let index = 0; index < rows.length; index += batchSize) {
      const markdown = rows.slice(index, index + batchSize).map(toRagSection).filter(Boolean).join("\n\n---\n\n");
      if (!markdown) continue;
      const part = String(partOffset + Math.floor(index / batchSize) + 1).padStart(5, "0");
      await bucket.file(`${prefix}/part-${part}.md`).save(markdown, { contentType: "text/markdown; charset=utf-8", resumable: false });
    }
    return `gs://${this.options.bucketName}/${prefix}/`;
  }

  async logRecommendation(event: {
    eventId: string; createdAt: Date; visitNames: string[]; stayMinutes: number[];
    accommodationTypes: string[]; moods: string[]; recommendedStayIds: string[]; recommendedStayNames: string[];
  }) {
    await this.bigQuery.dataset(this.options.datasetId).table("recommendation_events").insert([{
      event_id: event.eventId, created_at: event.createdAt.toISOString(), visit_names: event.visitNames,
      stay_minutes: event.stayMinutes, accommodation_types: event.accommodationTypes, moods: event.moods,
      recommended_stay_ids: event.recommendedStayIds, recommended_stay_names: event.recommendedStayNames
    }]);
  }
}

function sanitizeIdentifier(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 900);
}

function toRagSection(row: Record<string, unknown>) {
  const title = String(row.title || row.TRDAR_CD_NM || row.ADSTRD_CD_NM || "공공데이터 항목");
  const entries = Object.entries(row)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .slice(0, 40)
    .map(([key, value]) => `- ${key}: ${String(value).replace(/\s+/g, " ").trim()}`);
  return `# ${title}\n${entries.join("\n")}`;
}
