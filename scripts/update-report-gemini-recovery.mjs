import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const root = process.cwd();
const source = path.join(root, "output", "AJOU_PBL_1차_MVP_프로젝트_통합_제출양식_6조_머물곳_리뷰_README_보완.docx");
const output = path.join(root, "output", "AJOU_PBL_1차_MVP_프로젝트_통합_제출양식_6조_머물곳_복구완료.docx");
const replacements = new Map([
  ["웹·Agent Engine: gemini-2.5-flash. 웹 배포 revision의 기존 gemini-3.6-flash 설정은 Vertex AI 404 원인으로 확인되어 수정 필요", "웹·Agent Engine: gemini-2.5-flash. Cloud Run revision seoul-stay-web-00005-5b5에 적용 후 실제 일정 분석과 Places 확인 성공"],
  ["기존 대규모 RAG 코퍼스 검색 400은 관광 전용 코퍼스 490개로 전환해 해결했다. 2026-08-11 웹 일정 분석 502는 배포 기본값 gemini-3.6-flash가 us-central1에서 404를 반환한 것이 원인이며 GEMINI_MODEL=gemini-2.5-flash 지정 후 재검증이 필요하다.", "기존 대규모 RAG 코퍼스 검색 400은 관광 전용 코퍼스 490개로 전환해 해결했다. 웹 일정 분석 502는 잘못된 gemini-3.6-flash 모델명이 원인이었으며, GEMINI_MODEL=gemini-2.5-flash를 적용한 revision에서 실제 Gemini 응답과 Places 장소 2개 반환을 확인해 해결했다."],
  ["2026-08-11 health ready이나 실제 일정 분석은 모델명 불일치로 502 확인; 환경변수 수정 후 smoke test 필요", "2026-08-11 revision seoul-stay-web-00005-5b5, health ready·demoData false·실제 일정 분석 및 Places smoke test 성공"]
]);

const decode = (value) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const textOf = (paragraph) => decode([...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(""));
function replaceParagraph(paragraph, text) {
  let used = false;
  const escaped = escape(text);
  return paragraph.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, (node) => {
    if (used) return node.replace(/>[^<]*<\/w:t>$/, "></w:t>");
    used = true;
    return `<w:t xml:space="preserve">${escaped}</w:t>`;
  });
}

const zip = await JSZip.loadAsync(await fs.readFile(source));
const file = zip.file("word/document.xml");
if (!file) throw new Error("word/document.xml missing");
const xml = await file.async("string");
const paragraphs = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
let changed = 0;
for (let i = 0; i < paragraphs.length; i++) {
  const current = textOf(paragraphs[i]);
  if (!replacements.has(current)) continue;
  paragraphs[i] = replaceParagraph(paragraphs[i], replacements.get(current));
  changed++;
}
if (changed !== replacements.size) throw new Error(`Expected ${replacements.size} replacements, got ${changed}`);
let cursor = 0;
zip.file("word/document.xml", xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, () => paragraphs[cursor++]));
const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
await fs.writeFile(output, bytes);
console.log(JSON.stringify({ output, changed, paragraphs: paragraphs.length, bytes: bytes.length }, null, 2));
