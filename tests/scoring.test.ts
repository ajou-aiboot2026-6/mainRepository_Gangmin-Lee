import { describe, expect, it } from "vitest";
import { haversineKm, rankAccommodation, selectEffectiveRoute, weightedCentroid } from "../src/server/services/scoring.js";
import type { Accommodation, RouteMetric, VisitPlace } from "../src/server/types.js";

const metric = (mode: "TRANSIT" | "WALK", durationMinutes: number, transfers = 0): RouteMetric => ({ mode, durationMinutes, distanceMeters: 1000, transfers });
const visit = (id: string, lat: number, lng: number, stayMinutes: number): VisitPlace => ({ id, query: id, name: id, category: "카페", address: "서울", lat, lng, stayMinutes, stayRationale: "test" });
const stay: Accommodation = { id: "s1", name: "숙소", address: "서울", lat: 37.5, lng: 127, sourceUrl: "https://example.com", overview: "", accommodationType: "호텔", moodTags: [], moodSimilarity: 1 };

describe("route-aware scoring", () => {
  it("uses stay duration as the centroid weight", () => {
    const centroid = weightedCentroid([visit("A", 0, 0, 60), visit("B", 10, 10, 180)]);
    expect(centroid.lat).toBe(7.5);
    expect(centroid.lng).toBe(7.5);
  });

  it("selects the faster available mode", () => {
    expect(selectEffectiveRoute(metric("TRANSIT", 18), metric("WALK", 12))?.mode).toBe("WALK");
    expect(selectEffectiveRoute(metric("TRANSIT", 18), null)?.mode).toBe("TRANSIT");
  });

  it("gives more influence to the longer visit", () => {
    const ranked = rankAccommodation(stay, [visit("short", 0, 0, 60), visit("long", 1, 1, 180)], [
      { transit: metric("TRANSIT", 50), walk: metric("WALK", 80) },
      { transit: metric("TRANSIT", 10), walk: metric("WALK", 70) }
    ]);
    expect(ranked?.weightedTravelMinutes).toBe(20);
    expect(ranked?.routes[1].weight).toBe(.75);
  });

  it("returns null when a destination has no route", () => {
    expect(rankAccommodation(stay, [visit("A", 0, 0, 60)], [{ transit: null, walk: null }])).toBeNull();
  });

  it("computes geographic distance", () => {
    expect(haversineKm({ lat: 37.5665, lng: 126.978 }, { lat: 37.5446, lng: 127.0557 })).toBeGreaterThan(7);
  });
});
