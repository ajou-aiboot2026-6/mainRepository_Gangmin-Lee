export type Coordinates = { lat: number; lng: number };

export type VisitPlace = Coordinates & {
  id: string;
  query: string;
  name: string;
  category: string;
  address: string;
  placeUrl?: string;
  stayMinutes: number;
  stayRationale: string;
};

export type Accommodation = Coordinates & {
  id: string;
  name: string;
  address: string;
  imageUrl?: string;
  sourceUrl: string;
  overview: string;
  accommodationType: string;
  moodTags: string[];
  moodSimilarity: number;
};

export type RouteMetric = {
  mode: "TRANSIT" | "WALK";
  durationMinutes: number;
  distanceMeters: number;
  transfers: number;
  landingUrl?: string;
  estimated?: boolean;
  steps?: RouteStep[];
};

export type RouteStep = {
  mode: "WALK" | "SUBWAY" | "BUS" | "TRAIN" | "OTHER";
  durationMinutes: number;
  distanceMeters: number;
  instruction: string;
  lineName?: string;
  departureStop?: string;
  arrivalStop?: string;
  headsign?: string;
  stopCount?: number;
};

export type VisitRoute = {
  visitId: string;
  visitName: string;
  stayMinutes: number;
  weight: number;
  transit: RouteMetric | null;
  walk: RouteMetric | null;
  bestMode: "TRANSIT" | "WALK";
  effectiveMinutes: number;
};

export type RankedAccommodation = Accommodation & {
  score: number;
  weightedTravelMinutes: number;
  worstTravelMinutes: number;
  routes: VisitRoute[];
  summary?: string;
  fitReasons?: string[];
  caveat?: string;
};

export type RecommendationFilters = {
  accommodationTypes: string[];
  moods: string[];
};
