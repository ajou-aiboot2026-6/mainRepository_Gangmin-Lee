import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app.js";

const config = { geminiModel: "gemini-2.5-flash", embeddingModel: "gemini-embedding-001", port: 8080 };

describe("API configuration contract", () => {
  it("reports that demo data is disabled", async () => {
    const response = await request(createApp(config)).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.demoData).toBe(false);
    expect(response.body.status).toBe("configuration_required");
    expect(response.body.services).toEqual({
      gemini: false, googleMaps: false, tourApi: false,
      seoulData: false, vertexAi: false, dataPlatform: false
    });
  });

  it("does not fabricate itinerary results without keys", async () => {
    const response = await request(createApp(config)).post("/api/itinerary/analyze").send({ message: "성수동 카페에 갈래" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("CONFIGURATION_REQUIRED");
  });

  it("rejects recommendations without real API configuration", async () => {
    const response = await request(createApp(config)).post("/api/recommendations").send({ visits: [], filters: { accommodationTypes: [], moods: [] } });
    expect(response.status).toBe(503);
  });

  it("does not analyze accommodation preferences without Gemini", async () => {
    const response = await request(createApp(config)).post("/api/preferences/analyze").send({ message: "조용한 호텔" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("CONFIGURATION_REQUIRED");
  });
});
