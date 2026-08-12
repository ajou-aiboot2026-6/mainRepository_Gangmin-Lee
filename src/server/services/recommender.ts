import type { GeminiClient } from "../clients/gemini.js";
import { cosineSimilarity, moodTagsFromOverview } from "../clients/gemini.js";
import type { GoogleMapsClient } from "../clients/googleMaps.js";
import type { TourApiClient } from "../clients/tour.js";
import type { RecommendationFilters, VisitPlace } from "../types.js";
import { haversineKm, rankAccommodation, weightedCentroid } from "./scoring.js";
import type { VertexRagClient } from "../cloud/vertexRag.js";

export class RecommendationService {
  constructor(private tour: TourApiClient, private googleMaps: GoogleMapsClient, private gemini: GeminiClient, private rag?: VertexRagClient) {}

  async recommend(visits: VisitPlace[], filters: RecommendationFilters) {
    const centroid = weightedCentroid(visits);
    const all = await this.tour.listSeoulStays(160);
    const typed = filters.accommodationTypes.length
      ? all.filter((item) => filters.accommodationTypes.includes(item.accommodationType))
      : all;
    const nearby = typed.sort((a, b) => haversineKm(a, centroid) - haversineKm(b, centroid)).slice(0, 12);

    await mapLimit(nearby, 4, async (item) => { item.overview = await this.tour.getOverview(item.id); });
    const moodQuery = filters.moods.join(" ").trim();
    if (moodQuery) {
      const vectors = await this.gemini.embed([
        `task: search result | query: ${moodQuery}`,
        ...nearby.map((item) => `title: ${item.name} | text: ${item.overview}`)
      ]);
      nearby.forEach((item, index) => {
        item.moodSimilarity = cosineSimilarity(vectors[0], vectors[index + 1]);
        item.moodTags = moodTagsFromOverview(item, filters.moods);
      });
    } else nearby.forEach((item) => { item.moodSimilarity = 1; });

    const ranked = await mapLimit(nearby, 3, async (stay) => {
      const routePairs = await mapLimit(visits, 3, async (visit) => {
        const [transit, walk] = await Promise.all([
          this.googleMaps.route(stay, visit, "TRANSIT"),
          this.googleMaps.route(stay, visit, "WALK")
        ]);
        return { transit, walk };
      });
      return rankAccommodation(stay, visits, routePairs);
    });
    const top = ranked.filter((item) => item !== null).sort((a, b) => a.score - b.score).slice(0, 5);
    const ragQuery = [...visits.map((visit) => `${visit.name} ${visit.category}`), ...filters.moods, ...filters.accommodationTypes].join(" ");
    const ragContexts = this.rag ? await this.rag.retrieve(ragQuery, 8) : [];
    const explanations = await this.gemini.explainRecommendations(top, filters.moods, ragContexts);
    const explanationMap = new Map(explanations.map((item) => [item.id, item]));
    return top.map((item) => ({ ...item, ...explanationMap.get(item.id), groundingSources: ragContexts.map((context) => context.sourceUri).filter(Boolean) }));
  }
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await task(items[index], index);
    }
  }));
  return output;
}
