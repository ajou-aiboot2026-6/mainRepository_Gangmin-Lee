import { describe, expect, it } from "vitest";
import { RAW_TABLE_SCHEMA, rawLoadMetadata, toRawStorageRow } from "../src/server/cloud/dataPlatform.js";

describe("BigQuery raw schema", () => {
  it("keeps a fixed outer schema when a public-data field changes type", () => {
    const at = new Date("2026-08-10T00:00:00.000Z");
    const stringZip = toRawStorageRow({ zipcode: "04799" }, "tour_content", at);
    const numericZip = toRawStorageRow({ zipcode: 4799 }, "tour_content", at);

    expect(Object.keys(stringZip)).toEqual(Object.keys(numericZip));
    expect(JSON.parse(stringZip.payload).zipcode).toBe("04799");
    expect(JSON.parse(numericZip.payload).zipcode).toBe(4799);
    expect(RAW_TABLE_SCHEMA).toEqual([
      { name: "payload", type: "STRING", mode: "REQUIRED" },
      { name: "_source", type: "STRING", mode: "REQUIRED" },
      { name: "_ingested_at", type: "TIMESTAMP", mode: "REQUIRED" }
    ]);
  });

  it("disables schema inference for both truncate and append loads", () => {
    const firstPage = rawLoadMetadata(1, "US");
    const nextPage = rawLoadMetadata(2, "US");

    expect(firstPage).toMatchObject({
      autodetect: false,
      schema: { fields: RAW_TABLE_SCHEMA },
      writeDisposition: "WRITE_TRUNCATE",
      location: "US"
    });
    expect(nextPage).toMatchObject({
      autodetect: false,
      schema: { fields: RAW_TABLE_SCHEMA },
      writeDisposition: "WRITE_APPEND",
      location: "US"
    });
  });
});
