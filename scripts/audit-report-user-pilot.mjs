import fs from "node:fs/promises";
import JSZip from "jszip";

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw new Error("Usage: node audit-report-user-pilot.mjs source.docx output.docx");

const sourceZip = await JSZip.loadAsync(await fs.readFile(sourcePath), { checkCRC32: true });
const outputZip = await JSZip.loadAsync(await fs.readFile(outputPath), { checkCRC32: true });
const sourceXml = await sourceZip.file("word/document.xml")?.async("string");
const outputXml = await outputZip.file("word/document.xml")?.async("string");
if (!sourceXml || !outputXml) throw new Error("word/document.xml missing");

const count = (text, pattern) => (text.match(pattern) || []).length;
const required = [
  "U1 - 팀원 A(여행 계획 사용자 관점)",
  "U2 - 팀원 B(비개발자 관점)",
  "U3 - 팀원 C(이동 편의 비교 관점)",
  "팀 내부 파일럿 리뷰(외부 사용자 조사가 아님)",
  "외부 사용자의 선택시간·만족도가 개선됐다는 결론은 아직 내리지 않으며"
];
const forbidden = [
  "U1 - 실제 사용자 테스트 미실시",
  "U2 - 실제 사용자 테스트 미실시",
  "U3 - 실제 사용자 테스트 미실시"
];

for (const text of required) {
  if (!outputXml.includes(text)) throw new Error(`Required text missing: ${text}`);
}
for (const text of forbidden) {
  if (outputXml.includes(text)) throw new Error(`Stale text remains: ${text}`);
}

const sourceEntries = Object.keys(sourceZip.files).filter((name) => !sourceZip.files[name].dir).sort();
const outputEntries = Object.keys(outputZip.files).filter((name) => !outputZip.files[name].dir).sort();
const sourceMedia = sourceEntries.filter((name) => name.startsWith("word/media/"));
const outputMedia = outputEntries.filter((name) => name.startsWith("word/media/"));
const exactRows = [...outputXml.matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)]
  .filter((match) => /<w:trHeight[^>]*w:hRule="exact"/.test(match[0])).length;

const report = {
  sourceEntries: sourceEntries.length,
  outputEntries: outputEntries.length,
  samePackageEntrySet: JSON.stringify(sourceEntries) === JSON.stringify(outputEntries),
  sourceParagraphs: count(sourceXml, /<w:p(?:\s[^>]*)?>/g),
  outputParagraphs: count(outputXml, /<w:p(?:\s[^>]*)?>/g),
  sourceTables: count(sourceXml, /<w:tbl(?:\s[^>]*)?>/g),
  outputTables: count(outputXml, /<w:tbl(?:\s[^>]*)?>/g),
  sourceDrawings: count(sourceXml, /<w:drawing(?:\s[^>]*)?>/g),
  outputDrawings: count(outputXml, /<w:drawing(?:\s[^>]*)?>/g),
  sourceMediaFiles: sourceMedia.length,
  outputMediaFiles: outputMedia.length,
  sameMediaNames: JSON.stringify(sourceMedia) === JSON.stringify(outputMedia),
  exactHeightRows: exactRows,
  requiredTextChecks: required.length,
  staleUserTestRows: forbidden.filter((text) => outputXml.includes(text)).length
};

if (!report.samePackageEntrySet) throw new Error("Package entry set changed");
if (report.sourceParagraphs !== report.outputParagraphs) throw new Error("Paragraph count changed");
if (report.sourceTables !== report.outputTables) throw new Error("Table count changed");
if (report.sourceDrawings !== report.outputDrawings) throw new Error("Drawing count changed");
if (!report.sameMediaNames) throw new Error("Media set changed");

console.log(JSON.stringify(report, null, 2));
