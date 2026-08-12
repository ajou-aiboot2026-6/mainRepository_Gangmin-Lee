import { AppError } from "../config.js";
import type { Coordinates, RouteMetric, RouteStep } from "../types.js";

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  googleMapsUri?: string;
};

type GoogleRoute = {
  duration?: string;
  distanceMeters?: number;
  legs?: Array<{ steps?: GoogleRouteStep[] }>;
};

type GoogleRouteStep = {
  travelMode?: string;
  staticDuration?: string;
  distanceMeters?: number;
  navigationInstruction?: { instructions?: string };
  transitDetails?: {
    headsign?: string;
    stopCount?: number;
    stopDetails?: { departureStop?: { name?: string }; arrivalStop?: { name?: string } };
    transitLine?: { name?: string; nameShort?: string; vehicle?: { type?: string; name?: { text?: string } } };
  };
};

export type PlaceMatch = {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  placeUrl?: string;
};

export class GoogleMapsClient {
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {}

  async searchPlace(query: string): Promise<PlaceMatch> {
    const response = await this.fetcher("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.googleMapsUri"
      },
      body: JSON.stringify({
        textQuery: query.includes("서울") ? query : `서울 ${query}`,
        pageSize: 5,
        languageCode: "ko",
        regionCode: "KR",
        locationBias: {
          circle: {
            center: { latitude: 37.5665, longitude: 126.978 },
            radius: 35000
          }
        }
      })
    });
    const data = await parseResponse<{ places?: GooglePlace[] }>(response, "PLACES_API_ERROR", "Google Places API");
    const match = data.places?.find(isSeoulPlace) ?? data.places?.[0];
    const lat = match?.location?.latitude;
    const lng = match?.location?.longitude;
    if (!match || lat === undefined || lng === undefined) {
      throw new AppError(422, "PLACE_NOT_FOUND", `장소를 찾지 못했습니다: ${query}`);
    }
    return {
      id: match.id,
      name: match.displayName?.text || query,
      category: match.primaryTypeDisplayName?.text || "장소",
      address: match.formattedAddress || "서울",
      lat,
      lng,
      placeUrl: match.googleMapsUri
    };
  }

  async route(origin: Coordinates, destination: Coordinates, mode: "TRANSIT" | "WALK"): Promise<RouteMetric | null> {
    const response = await this.fetcher("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": [
          "routes.duration", "routes.distanceMeters", "routes.legs.steps.travelMode",
          "routes.legs.steps.staticDuration", "routes.legs.steps.distanceMeters",
          "routes.legs.steps.navigationInstruction.instructions",
          "routes.legs.steps.transitDetails.stopDetails",
          "routes.legs.steps.transitDetails.headsign", "routes.legs.steps.transitDetails.stopCount",
          "routes.legs.steps.transitDetails.transitLine"
        ].join(",")
      },
      body: JSON.stringify({
        origin: toWaypoint(origin),
        destination: toWaypoint(destination),
        travelMode: mode,
        languageCode: "ko",
        units: "METRIC"
      })
    });
    const data = await parseResponse<{ routes?: GoogleRoute[] }>(response, "ROUTES_API_ERROR", "Google Routes API");
    const route = data.routes?.[0];
    if (!route) return mode === "WALK" ? estimateWalkingRoute(origin, destination) : null;
    const seconds = parseDurationSeconds(route.duration);
    if (!seconds) return null;
    const steps = route.legs?.flatMap((leg) => leg.steps || []).map(toRouteStep).filter((step): step is RouteStep => Boolean(step)) || [];
    const transitSteps = steps.filter((step) => step.mode !== "WALK").length;
    return {
      mode,
      durationMinutes: Math.max(1, Math.round(seconds / 60)),
      distanceMeters: route.distanceMeters || 0,
      transfers: mode === "TRANSIT" ? Math.max(0, transitSteps - 1) : 0,
      landingUrl: directionsUrl(origin, destination, mode),
      estimated: false,
      steps
    };
  }
}

function toWaypoint(point: Coordinates) {
  return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}

function isSeoulPlace(place: GooglePlace) {
  return /서울|Seoul/i.test(place.formattedAddress || "");
}

function parseDurationSeconds(duration?: string) {
  if (!duration?.endsWith("s")) return 0;
  const seconds = Number(duration.slice(0, -1));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function directionsUrl(origin: Coordinates, destination: Coordinates, mode: "TRANSIT" | "WALK") {
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: mode === "TRANSIT" ? "transit" : "walking"
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

function estimateWalkingRoute(origin: Coordinates, destination: Coordinates): RouteMetric {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(destination.lat - origin.lat);
  const dLng = toRadians(destination.lng - origin.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(origin.lat)) * Math.cos(toRadians(destination.lat)) * Math.sin(dLng / 2) ** 2;
  const straightMeters = earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const estimatedMeters = Math.round(straightMeters * 1.25);
  const durationMinutes = Math.max(1, Math.round((estimatedMeters / 1000) / 4.5 * 60));
  return {
    mode: "WALK", durationMinutes, distanceMeters: estimatedMeters, transfers: 0, estimated: true,
    steps: [{ mode: "WALK", durationMinutes, distanceMeters: estimatedMeters, instruction: `도보 약 ${durationMinutes}분` }]
  };
}

function toRouteStep(step: GoogleRouteStep): RouteStep | null {
  const durationMinutes = parseDurationSeconds(step.staticDuration) / 60;
  const distanceMeters = step.distanceMeters || 0;
  if (step.travelMode === "WALK") {
    return { mode: "WALK", durationMinutes, distanceMeters, instruction: step.navigationInstruction?.instructions || "도보 이동" };
  }
  if (step.travelMode !== "TRANSIT") return null;
  const details = step.transitDetails;
  const vehicleType = details?.transitLine?.vehicle?.type || "OTHER";
  const mode: RouteStep["mode"] = vehicleType === "BUS" || vehicleType === "INTERCITY_BUS" || vehicleType === "TROLLEYBUS"
    ? "BUS"
    : ["SUBWAY", "METRO_RAIL"].includes(vehicleType) ? "SUBWAY"
      : ["RAIL", "HEAVY_RAIL", "COMMUTER_TRAIN", "HIGH_SPEED_TRAIN", "LONG_DISTANCE_TRAIN"].includes(vehicleType) ? "TRAIN" : "OTHER";
  const lineName = details?.transitLine?.nameShort || details?.transitLine?.name || details?.transitLine?.vehicle?.name?.text;
  return {
    mode, durationMinutes, distanceMeters,
    instruction: [modeLabel(mode), lineName].filter(Boolean).join(" ") || "대중교통",
    lineName,
    departureStop: details?.stopDetails?.departureStop?.name,
    arrivalStop: details?.stopDetails?.arrivalStop?.name,
    headsign: details?.headsign,
    stopCount: details?.stopCount
  };
}

function modeLabel(mode: RouteStep["mode"]) {
  return ({ WALK: "도보", SUBWAY: "지하철", BUS: "버스", TRAIN: "기차", OTHER: "대중교통" } as const)[mode];
}

async function parseResponse<T>(response: Response, code: string, label: string): Promise<T> {
  const data = await safeJson(response);
  if (!response.ok) {
    const message = typeof data === "object" && data && "error" in data
      ? (data as { error?: { message?: string } }).error?.message
      : undefined;
    throw new AppError(response.status, code, `${label} 호출에 실패했습니다 (${response.status}).`, message || data);
  }
  return data as T;
}

async function safeJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return undefined; }
}
