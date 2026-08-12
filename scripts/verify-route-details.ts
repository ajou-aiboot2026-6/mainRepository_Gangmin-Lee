import "dotenv/config";
import { GoogleMapsClient } from "../src/server/clients/googleMaps.js";

const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
if (!key) throw new Error("GOOGLE_MAPS_API_KEY가 필요합니다.");
const route = await new GoogleMapsClient(key).route(
  { lat: 37.5445, lng: 127.0560 },
  { lat: 37.5563, lng: 126.9236 },
  "TRANSIT"
);
console.log(JSON.stringify({
  durationMinutes: route?.durationMinutes,
  transfers: route?.transfers,
  steps: route?.steps?.map((step) => ({ mode: step.mode, minutes: step.durationMinutes, line: step.lineName, from: step.departureStop, to: step.arrivalStop }))
}, null, 2));
