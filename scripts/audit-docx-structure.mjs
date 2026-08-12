import fs from "node:fs/promises";
import JSZip from "jszip";

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw new Error("Usage: node audit-docx-structure.mjs source.docx output.docx");

const load = async (file) => JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true });
const source = await load(sourcePath);
const output = await load(outputPath);
const sourceXml = await source.file("word/document.xml")?.async("string");
const outputXml = await output.file("word/document.xml")?.async("string");
if (!sourceXml || !outputXml) throw new Error("word/document.xml missing");

const files = (zip) => Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort();
const count = (text, pattern) => (text.match(pattern) || []).length;
const required = [
  "동료팀 관점 사전 리뷰(실제 피드백 수집 전 자체점검)",
  "평가기준 기반 강사 관점 자체점검(실제 평가가 아님)",
  "GEMINI_MODEL=gemini-2.5-flash 지정 후 재검증이 필요하다"
];
for (const text of required) if (!outputXml.includes(text)) throw new Error(`Required text missing: ${text}`);

const result = {
  samePackageFiles: JSON.stringify(files(source)) === JSON.stringify(files(output)),
  sourceParagraphs: count(sourceXml, /<w:p(?:\s[^>]*)?>/g),
  outputParagraphs: count(outputXml, /<w:p(?:\s[^>]*)?>/g),
  sourceTables: count(sourceXml, /<w:tbl(?:\s[^>]*)?>/g),
  outputTables: count(outputXml, /<w:tbl(?:\s[^>]*)?>/g),
  sourceDrawings: count(sourceXml, /<w:drawing(?:\s[^>]*)?>/g),
  outputDrawings: count(outputXml, /<w:drawing(?:\s[^>]*)?>/g),
  exactHeightRows: [...outputXml.matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)].filter((m) => /<w:trHeight[^>]*w:hRule="exact"/.test(m[0])).length,
  requiredChecks: required.length
};

if (!result.samePackageFiles) throw new Error("DOCX package files changed");
if (result.sourceParagraphs !== result.outputParagraphs) throw new Error("Paragraph count changed");
if (result.sourceTables !== result.outputTables) throw new Error("Table count changed");
if (result.sourceDrawings !== result.outputDrawings) throw new Error("Drawing count changed");
console.log(JSON.stringify(result, null, 2));
