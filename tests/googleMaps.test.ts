import { describe, expect, it, vi } from "vitest";
import { GoogleMapsClient } from "../src/server/clients/googleMaps.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("GoogleMapsClient", () => {
  it("searches Seoul places through Places API (New)", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ places: [{
      id: "place-1",
      displayName: { text: "어니언 성수" },
      formattedAddress: "대한민국 서울특별시 성동구",
      location: { latitude: 37.544, longitude: 127.055 },
      primaryTypeDisplayName: { text: "카페" },
      googleMapsUri: "https://maps.google.com/example"
    }] }));
    const client = new GoogleMapsClient("test-key", fetcher);

    const place = await client.searchPlace("어니언 성수");

    expect(place).toMatchObject({ name: "어니언 성수", category: "카페", lat: 37.544, lng: 127.055 });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(JSON.parse(String(init?.body)).textQuery).toBe("서울 어니언 성수");
    expect(new Headers(init?.headers).get("X-Goog-Api-Key")).toBe("test-key");
  });

  it("parses transit duration and transfers from Routes API", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ routes: [{
      duration: "1850s",
      distanceMeters: 9400,
      legs: [{ steps: [
        { travelMode: "WALK", staticDuration: "300s", distanceMeters: 350 },
        { travelMode: "TRANSIT", staticDuration: "720s", distanceMeters: 5000, transitDetails: { transitLine: { nameShort: "2호선", vehicle: { type: "SUBWAY" } }, stopDetails: { departureStop: { name: "성수역" }, arrivalStop: { name: "홍대입구역" } }, stopCount: 8 } },
        { travelMode: "WALK", staticDuration: "180s", distanceMeters: 220 },
        { travelMode: "TRANSIT", staticDuration: "480s", distanceMeters: 3800, transitDetails: { transitLine: { nameShort: "271", vehicle: { type: "BUS" } } } }
      ] }]
    }] }));
    const client = new GoogleMapsClient("test-key", fetcher);

    const route = await client.route({ lat: 37.5, lng: 127 }, { lat: 37.55, lng: 126.92 }, "TRANSIT");

    expect(route).toMatchObject({ mode: "TRANSIT", durationMinutes: 31, distanceMeters: 9400, transfers: 1 });
    expect(route?.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ mode: "SUBWAY", lineName: "2호선", departureStop: "성수역", arrivalStop: "홍대입구역" }),
      expect.objectContaining({ mode: "BUS", lineName: "271" })
    ]));
    expect(route?.landingUrl).toContain("travelmode=transit");
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.travelMode).toBe("TRANSIT");
  });

  it("returns null when transit has no route", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ routes: [] }));
    const client = new GoogleMapsClient("test-key", fetcher);

    await expect(client.route({ lat: 37.5, lng: 127 }, { lat: 37.55, lng: 126.92 }, "TRANSIT")).resolves.toBeNull();
  });

  it("uses a labeled coordinate estimate when Seoul walking routes are unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ routes: [] }));
    const client = new GoogleMapsClient("test-key", fetcher);

    const route = await client.route({ lat: 37.5447328, lng: 127.0582091 }, { lat: 37.5415795, lng: 127.0614594 }, "WALK");
    expect(route).toMatchObject({ mode: "WALK", estimated: true, transfers: 0 });
    expect(route?.durationMinutes).toBeGreaterThan(1);
  });

  it("surfaces Google API errors without fabricating data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: { message: "API key not valid" } }, 403));
    const client = new GoogleMapsClient("bad-key", fetcher);

    await expect(client.searchPlace("성수동 카페")).rejects.toMatchObject({ status: 403, code: "PLACES_API_ERROR" });
  });
});
