import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const root = process.cwd();
const source = path.join(root, "output", "AJOU_PBL_1차_MVP_프로젝트_통합_제출양식_6조_머물곳_사용자테스트_보완.docx");
const output = path.join(root, "output", "AJOU_PBL_1차_MVP_프로젝트_통합_제출양식_6조_머물곳_리뷰_README_보완.docx");

const replacements = new Map([
  ["동료 팀", "동료팀 관점 사전 리뷰(실제 피드백 수집 전 자체점검)"],
  ["동료 팀 피드백 미수집", "GCP 서비스 활용 폭과 데이터 규모는 강점이지만, 서비스 나열보다 각 기술을 왜 선택했고 사용자 가치에 어떻게 연결되는지 보여줄 필요가 있다."],
  ["받지 않은 피드백을 작성하지 않음", "아키텍처·데이터 흐름·검증 수치를 중심으로 설명하고, 실제 동료팀 발언은 발표 후 별도로 기록해야 한다."],
  ["강사/리뷰어", "평가기준 기반 강사 관점 자체점검(실제 평가가 아님)"],
  ["강사·리뷰어 피드백 미수집", "구현 30%와 Google Cloud 활용 30%는 실제 동작·근거로 증명하고, Application 전환 가능성 20%와 창의성 20%는 가격·예약·택시·캐리어 확장성과 체류시간 기반 추천 차별성으로 설명해야 한다."],
  ["발표 후 데이터·GCP 활용·사용성 피드백을 구분해 기록 예정", "단순 기능 목록보다 문제-기술 선택-활용 방식-검증 결과를 연결하고, 시연 전 실제 배포 API smoke test를 통과시켜야 한다."],
  ["구현과 GCP 배포는 완료했지만 초기 RAG 범위가 과도했고 사용자 검증이 부족함", "구현과 GCP 배포는 완료했지만 초기 RAG 범위가 과도했고, 웹 배포 환경의 잘못된 Gemini 모델명이 smoke test에서 발견됐으며 외부 사용자 검증이 부족하다."],
  ["서비스별 강점에 맞춰 RAG와 BigQuery를 분리하고 검증 체크리스트를 남김", "RAG와 BigQuery를 데이터 성격에 맞게 분리하고, health 확인과 실제 모델 호출을 구분하는 배포 smoke test 및 모델 버전 점검 항목을 README에 추가했다."],
  ["웹: gemini-3.6-flash / Agent Engine: gemini-2.5-flash", "웹·Agent Engine: gemini-2.5-flash. 웹 배포 revision의 기존 gemini-3.6-flash 설정은 Vertex AI 404 원인으로 확인되어 수정 필요"],
  ["gemini-3.6-flash, 구조화 JSON 스키마", "gemini-2.5-flash, 구조화 JSON 스키마"],
  ["gemini-3.6-flash; ADK Agent는 gemini-2.5-flash", "웹·ADK Agent 모두 gemini-2.5-flash 사용"],
  ["기존 대규모 RAG 코퍼스는 4,828개 파일 활성 상태에서도 Vector Search 검색 400. 관광 전용 코퍼스 490개로 전환해 검색 문맥 3개·출처 3개 반환 확인", "기존 대규모 RAG 코퍼스 검색 400은 관광 전용 코퍼스 490개로 전환해 해결했다. 2026-08-11 웹 일정 분석 502는 배포 기본값 gemini-3.6-flash가 us-central1에서 404를 반환한 것이 원인이며 GEMINI_MODEL=gemini-2.5-flash 지정 후 재검증이 필요하다."],
  ["2026-08-11 health ready 확인", "2026-08-11 health ready이나 실제 일정 분석은 모델명 불일치로 502 확인; 환경변수 수정 후 smoke test 필요"]
]);

const replacementsWithCounts = new Map();
function decodeXml(value) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function plainText(paragraph) {
  return decodeXml([...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(""));
}
function replaceParagraph(paragraph, text) {
  const escaped = escapeXml(text);
  let replaced = false;
  let result = paragraph.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, (node) => {
    if (replaced) return node.replace(/>[^<]*<\/w:t>$/, "></w:t>");
    replaced = true;
    return `<w:t xml:space="preserve">${escaped}</w:t>`;
  });
  if (!replaced) result = result.replace(/<\/w:p>$/, `<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`);
  return result;
}

const zip = await JSZip.loadAsync(await fs.readFile(source));
const documentFile = zip.file("word/document.xml");
if (!documentFile) throw new Error("word/document.xml not found");
const xml = await documentFile.async("string");
const paragraphs = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];

for (let index = 0; index < paragraphs.length; index++) {
  const text = plainText(paragraphs[index]);
  if (!replacements.has(text)) continue;
  paragraphs[index] = replaceParagraph(paragraphs[index], replacements.get(text));
  replacementsWithCounts.set(text, (replacementsWithCounts.get(text) || 0) + 1);
}

const scopedPending = [
  ["동료팀 관점 사전 리뷰(실제 피드백 수집 전 자체점검)", "사전 반영 - 아키텍처 그림, GCP 선택 이유, 483,540행 데이터와 21/21 검증 수치를 보고서·README에 정리"],
  ["평가기준 기반 강사 관점 자체점검(실제 평가가 아님)", "사전 반영 - 구현·GCP·전환 가능성·창의성 평가 항목별 근거를 정리하고 실제 평가는 발표 후 별도 기록"]
];
for (const [anchor, replacement] of scopedPending) {
  const start = paragraphs.findIndex((paragraph) => plainText(paragraph) === anchor);
  if (start < 0) throw new Error(`Anchor not found: ${anchor}`);
  const pending = paragraphs.findIndex((paragraph, index) => index > start && index <= start + 5 && plainText(paragraph) === "보류");
  if (pending < 0) throw new Error(`Pending cell not found after: ${anchor}`);
  paragraphs[pending] = replaceParagraph(paragraphs[pending], replacement);
}

const uniqueKeys = [...replacements.keys()];
for (const key of uniqueKeys) {
  if ((replacementsWithCounts.get(key) || 0) !== 1) throw new Error(`Expected one match for '${key}', got ${replacementsWithCounts.get(key) || 0}`);
}

let cursor = 0;
zip.file("word/document.xml", xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, () => paragraphs[cursor++]));
const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
await fs.writeFile(output, bytes);
console.log(JSON.stringify({ output, paragraphs: paragraphs.length, replacementCount: [...replacementsWithCounts.values()].reduce((a, b) => a + b, 0) + scopedPending.length, bytes: bytes.length }, null, 2));
