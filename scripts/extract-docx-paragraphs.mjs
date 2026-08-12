import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node extract-docx-paragraphs.mjs input.docx output.json");

const zip = await JSZip.loadAsync(await fs.readFile(input));
const documentXml = await zip.file("word/document.xml")?.async("string");
if (!documentXml) throw new Error("word/document.xml not found");

const decodeXml = (value) => value
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&");

const paragraphs = (documentXml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || []).map((xml, index) => ({
  index,
  text: decodeXml([...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join("")),
  style: xml.match(/<w:pStyle w:val="([^"]+)"/)?.[1] || null,
}));

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(paragraphs, null, 2), "utf8");
console.log(JSON.stringify({ input, output, paragraphs: paragraphs.length }));
