import { describe, expect, it, vi } from "vitest";
import { GeminiClient } from "../src/server/clients/gemini.js";

describe("Gemini embeddings", () => {
  it("sends one content per Vertex AI embedContent request", async () => {
    const client = new GeminiClient("test-key", "gemini-test", "embedding-test");
    const embedContent = vi.fn(async ({ contents }: { contents: Array<{ parts: Array<{ text: string }> }> }) => ({
      embeddings: [{ values: [contents[0].parts[0].text.length, 1] }]
    }));
    (client as unknown as { ai: { models: { embedContent: typeof embedContent } } }).ai = { models: { embedContent } };

    const vectors = await client.embed(["조용한", "전망 좋은", "호텔"]);

    expect(embedContent).toHaveBeenCalledTimes(3);
    expect(embedContent.mock.calls.every(([request]) => request.contents.length === 1)).toBe(true);
    expect(vectors).toEqual([[3, 1], [5, 1], [2, 1]]);
  });
});
