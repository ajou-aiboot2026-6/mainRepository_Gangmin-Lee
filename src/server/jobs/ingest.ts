import { loadConfig } from "../config.js";
import { DataPlatform } from "../cloud/dataPlatform.js";
import { SeoulOpenDataClient, SEOUL_DATASETS } from "../clients/seoulData.js";
import { TourApiClient } from "../clients/tour.js";

const config = loadConfig();
const pageSize = positiveInt(process.env.INGEST_PAGE_SIZE, 1000);
const maxPages = positiveInt(process.env.INGEST_MAX_PAGES, 0);
const source = process.env.INGEST_SOURCE?.trim() || "all";

if (!config.googleCloudProject || !config.gcsRawBucket) throw new Error("GOOGLE_CLOUD_PROJECT와 GCS_RAW_BUCKET이 필요합니다.");
const platform = new DataPlatform({
  projectId: config.googleCloudProject,
  bucketName: config.gcsRawBucket,
  datasetId: config.bigQueryDataset,
  bigQueryLocation: config.bigQueryLocation
});

await platform.ensureInfrastructure();
const results: unknown[] = [];
if (source === "all" || source === "tour") results.push(await ingestTour());
if (source === "all" || source === "seoul") results.push(...await ingestSeoul());
console.log(JSON.stringify({ status: "complete", results }));

async function ingestTour() {
  if (!config.tourApiServiceKey) throw new Error("TOUR_API_SERVICE_KEY가 필요합니다.");
  const startedAt = new Date();
  const client = new TourApiClient(config.tourApiServiceKey);
  let pageNo = 1, collected = 0, totalCount = Number.POSITIVE_INFINITY;
  const objects: string[] = [];
  while (collected < totalCount && (!maxPages || pageNo <= maxPages)) {
    const page = await client.listAllContentPage(pageNo, pageSize);
    totalCount = page.totalCount;
    if (!page.items.length) break;
    const loaded = await platform.saveAndLoad("tour_content", page.items, startedAt, pageNo);
    await platform.saveRagMarkdown("tour_content", page.items, startedAt, 100, (pageNo - 1) * Math.ceil(pageSize / 100));
    objects.push(loaded.objectUri);
    collected += page.items.length;
    console.log(JSON.stringify({ source: "tour_content", page: pageNo, collected, totalCount }));
    pageNo++;
  }
  return { source: "tour_content", rowCount: collected, objectCount: objects.length, ragPrefix: `gs://${config.gcsRawBucket}/rag/tour_content/${startedAt.toISOString().slice(0, 10)}/` };
}

async function ingestSeoul() {
  if (!config.seoulOpenDataApiKey) throw new Error("SEOUL_OPEN_DATA_API_KEY가 필요합니다.");
  const client = new SeoulOpenDataClient(config.seoulOpenDataApiKey);
  const output: unknown[] = [];
  for (const dataset of SEOUL_DATASETS) {
    const startedAt = new Date();
    let page = 1, collected = 0, totalCount = Number.POSITIVE_INFINITY;
    while (collected < totalCount && (!maxPages || page <= maxPages)) {
      const start = (page - 1) * pageSize + 1;
      const response = await client.page(dataset, start, start + pageSize - 1);
      totalCount = response.totalCount;
      if (!response.rows.length) break;
      await platform.saveAndLoad(dataset.id, response.rows, startedAt, page);
      await platform.saveRagMarkdown(dataset.id, response.rows, startedAt, 100, (page - 1) * Math.ceil(pageSize / 100));
      collected += response.rows.length;
      console.log(JSON.stringify({ source: dataset.id, page, collected, totalCount }));
      page++;
    }
    output.push({ source: dataset.id, rowCount: collected, pageCount: page - 1, ragPrefix: `gs://${config.gcsRawBucket}/rag/${dataset.id}/${startedAt.toISOString().slice(0, 10)}/` });
  }
  return output;
}

function positiveInt(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}
