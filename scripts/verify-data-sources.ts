import "dotenv/config";
import { SeoulOpenDataClient, SEOUL_DATASETS } from "../src/server/clients/seoulData.js";
import { TourApiClient } from "../src/server/clients/tour.js";

const seoulKey = process.env.SEOUL_OPEN_DATA_API_KEY?.trim();
const tourKey = process.env.TOUR_API_SERVICE_KEY?.trim();
if (!seoulKey || !tourKey) throw new Error("SEOUL_OPEN_DATA_API_KEY와 TOUR_API_SERVICE_KEY가 필요합니다.");

const seoul = new SeoulOpenDataClient(seoulKey);
for (const dataset of SEOUL_DATASETS) {
  const result = await seoul.page(dataset, 1, 5);
  console.log(JSON.stringify({ source: dataset.id, service: dataset.service, totalCount: result.totalCount, sampleRows: result.rows.length }));
}
const tour = await new TourApiClient(tourKey).listAllContentPage(1, 5);
console.log(JSON.stringify({ source: "tour_content", totalCount: tour.totalCount, sampleRows: tour.items.length }));
