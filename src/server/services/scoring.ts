import type { Accommodation, RankedAccommodation, RouteMetric, VisitPlace, VisitRoute } from "../types.js";

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function weightedCentroid(visits: VisitPlace[]) {
  const total = visits.reduce((sum, visit) => sum + visit.stayMinutes, 0);
  return {
    lat: visits.reduce((sum, visit) => sum + visit.lat * visit.stayMinutes, 0) / total,
    lng: visits.reduce((sum, visit) => sum + visit.lng * visit.stayMinutes, 0) / total
  };
}

export function selectEffectiveRoute(transit: RouteMetric | null, walk: RouteMetric | null) {
  if (!transit && !walk) return null;
  if (!transit) return walk;
  if (!walk) return transit;
  return walk.durationMinutes <= transit.durationMinutes ? walk : transit;
}

export function rankAccommodation(accommodation: Accommodation, visits: VisitPlace[], routePairs: Array<{ transit: RouteMetric | null; walk: RouteMetric | null }>): RankedAccommodation | null {
  const totalStay = visits.reduce((sum, visit) => sum + visit.stayMinutes, 0);
  const routes: VisitRoute[] = [];
  for (let index = 0; index < visits.length; index++) {
    const selected = selectEffectiveRoute(routePairs[index].transit, routePairs[index].walk);
    if (!selected) return null;
    const visit = visits[index];
    routes.push({
      visitId: visit.id, visitName: visit.name, stayMinutes: visit.stayMinutes,
      weight: visit.stayMinutes / totalStay,
      transit: routePairs[index].transit, walk: routePairs[index].walk,
      bestMode: selected.mode, effectiveMinutes: selected.durationMinutes
    });
  }
  const weightedTravelMinutes = routes.reduce((sum, route) => sum + route.effectiveMinutes * route.weight, 0);
  const worstTravelMinutes = Math.max(...routes.map((route) => route.effectiveMinutes));
  const transferPenalty = routes.reduce((sum, route) => sum + (route.transit?.transfers || 0) * route.weight * 2.5, 0);
  const moodPenalty = (1 - Math.max(0, accommodation.moodSimilarity)) * 8;
  const score = weightedTravelMinutes + worstTravelMinutes * 0.15 + transferPenalty + moodPenalty;
  return { ...accommodation, score: round(score), weightedTravelMinutes: round(weightedTravelMinutes), worstTravelMinutes, routes };
}

function round(value: number) { return Math.round(value * 10) / 10; }
