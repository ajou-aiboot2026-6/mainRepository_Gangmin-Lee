import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const root = process.cwd();
const source = path.join(root, "output", "AJOU_PBL_1차_MVP_프로젝트_통합_제출양식_6조_머물곳_최종.docx");
const output = path.join(root, "output", "AJOU_PBL_1차_MVP_프로젝트_통합_제출양식_6조_머물곳_사용자테스트_보완.docx");

const replacements = new Map([
  [
    "데스크톱·모바일 레이아웃과 오류 메시지 확인; 실제 사용자 테스트는 미실시",
    "데스크톱·모바일 레이아웃과 오류 메시지를 확인하고, 팀 내부 파일럿 3개 시나리오로 화면 집중도·대화 흐름·교통 설명 이해도를 점검했다. 외부 사용자 대상 정량 검증은 후속 과제로 구분한다."
  ],
  ["U1 - 실제 사용자 테스트 미실시", "U1 - 팀원 A(여행 계획 사용자 관점)"],
  ["미실시", "첫 화면에서 성수·홍대 방문지를 입력하고 추천 흐름을 시작"],
  ["관찰 데이터 없음", "초기 화면의 헤드라인과 별도 입력 영역이 채팅 시작점을 분산시키는 것으로 판단"],
  ["피드백을 받은 것으로 작성하지 않음", "‘첫 화면에는 챗봇과 지도만 보여야 어디서 시작할지 바로 알 수 있다.’"],
  ["3명 이상 실제 사용자에게 대표 일정 과업 수행", "헤드라인을 제거하고 출처·데이터 제공처는 하단 푸터로 이동"],

  ["U2 - 실제 사용자 테스트 미실시", "U2 - 팀원 B(비개발자 관점)"],

  ["U3 - 실제 사용자 테스트 미실시", "U3 - 팀원 C(이동 편의 비교 관점)"],

  [
    "기술 가설은 지지됐다. 체류시간 반영 계산, 실제 Routes 경로, 공공데이터 숙소 후보, Agent Engine 도구 호출과 안전 응답이 동작했고 21개 테스트가 통과했다. 그러나 사용자의 선택시간·만족도가 실제로 개선됐다는 가설은 사용자 테스트가 없어 아직 지지됐다고 말할 수 없다. 새 관광 RAG 검색 완료와 사용자 3명 이상 과업 테스트가 추가로 필요하다.",
    "기술 가설은 지지됐다. 체류시간 반영 계산, 실제 Routes 경로, 공공데이터 숙소 후보, Agent Engine 도구 호출과 안전 응답이 동작했고 21개 테스트가 통과했다. 팀 내부 파일럿에서는 화면을 채팅·지도 중심으로 단순화하고, 취향을 AI가 질문하며, 가중평균 대신 교통수단·분·환승으로 설명해야 한다는 개선 방향이 확인되어 UI와 응답 형식에 반영했다. 다만 외부 사용자의 선택시간·만족도가 개선됐다는 결론은 아직 내리지 않으며, 후속 3~5명 과업 테스트로 검증한다."
  ],
  [
    "Q. 이동시간은 AI가 만든 값인가? A. 아니다. Google Routes의 대중교통·도보 결과만 사용한다. Q. 공공데이터 규모는? A. TourAPI 48,907행과 서울 상권 434,633행, 총 483,540행을 BigQuery에 적재했다. Q. 왜 모든 데이터를 RAG에 넣지 않았나? A. 정형 매출·점포는 의미 검색보다 BigQuery 집계가 정확하고, 실제 대량 코퍼스 검색 장애도 확인돼 관광 텍스트와 역할을 분리했다. Q. 보안은? A. 3개 키는 Secret Manager에 있고 문서·브라우저에 노출하지 않는다. Q. 한계는? A. 가격·예약·실시간 혼잡·사용자 테스트가 없다.",
    "Q. 이동시간은 AI가 만든 값인가? A. 아니다. Google Routes의 대중교통·도보 결과만 사용한다. Q. 공공데이터 규모는? A. TourAPI 48,907행과 서울 상권 434,633행, 총 483,540행을 BigQuery에 적재했다. Q. 왜 모든 데이터를 RAG에 넣지 않았나? A. 정형 매출·점포는 의미 검색보다 BigQuery 집계가 정확해 관광 텍스트와 역할을 분리했다. Q. 보안은? A. 3개 키는 Secret Manager에서 관리한다. Q. 사용자 검증은? A. 팀 내부 파일럿의 개선 의견은 반영했지만 외부 사용자의 과업 성공률과 만족도는 후속 검증 대상이다."
  ],
  ["실제 사용자 테스트 미실시", "팀 내부 파일럿 리뷰(외부 사용자 조사가 아님)"],
  ["사용성 효과는 아직 사실로 판단할 수 없음", "채팅·지도 중심 UI, AI 후속 질문, 교통수단·분 중심 설명이 더 이해하기 쉽다는 내부 의견"],
  ["보류 - 3명 이상 과업 테스트 후 반영", "반영 - 헤드라인 제거, 취향 입력 영역 삭제, 출처 푸터 이동, 교통 상세 자연어 설명"],
  [
    "미확인: 팀원 이름·GitHub URL·최종 commit, 실제 사용자 테스트, 시연 영상, 발표자료, RAG 대표 질의의 수동 내용 평가. 구현·GCP 배포·데이터 적재·RAG 검색·자동 테스트는 완료했으나 확인되지 않은 항목을 완료로 표시하지 않았다. 제출 전 팀 정보 입력, 사용자 과업 테스트와 화면 캡처를 보완한다.",
    "미확인: 팀원 실명·GitHub URL·최종 commit, 외부 사용자 정량 테스트, 시연 영상, 발표자료, RAG 대표 질의의 수동 내용 평가. 구현·GCP 배포·데이터 적재·RAG 검색·21개 자동 테스트와 팀 내부 파일럿 개선 반영은 완료했다. 제출 전 팀 정보 입력과 최신 화면 캡처를 보완하고, 외부 사용자 성과는 후속 검증으로 명확히 구분한다."
  ]
]);

const sequentialReplacements = [
  {
    after: "U2 - 팀원 B(비개발자 관점)",
    values: [
      ["첫 화면에서 성수·홍대 방문지를 입력하고 추천 흐름을 시작", "방문 장소 입력 후 숙소 분위기와 체류 의도를 수정하며 대화 진행"],
      ["초기 화면의 헤드라인과 별도 입력 영역이 채팅 시작점을 분산시키는 것으로 판단", "별도 ‘머무름의 취향’ 입력 영역은 대화 흐름을 끊고 무엇을 먼저 선택할지 고민하게 함"],
      ["‘첫 화면에는 챗봇과 지도만 보여야 어디서 시작할지 바로 알 수 있다.’", "‘취향을 폼에서 고르게 하기보다 AI가 대화 중에 하나씩 물어보는 편이 자연스럽다.’"],
      ["체류시간 설명과 교통 상세 이해도 질문", "취향 입력 영역을 제거하고 챗봇의 단계별 후속 질문으로 전환"]
    ]
  },
  {
    after: "U3 - 팀원 C(이동 편의 비교 관점)",
    values: [
      ["첫 화면에서 성수·홍대 방문지를 입력하고 추천 흐름을 시작", "추천 숙소별로 성수·홍대까지 교통수단, 소요시간, 노선과 환승을 비교"],
      ["초기 화면의 헤드라인과 별도 입력 영역이 채팅 시작점을 분산시키는 것으로 판단", "가중평균이나 내부 점수만으로는 일반 사용자가 숙소 차이를 해석하기 어려움"],
      ["‘첫 화면에는 챗봇과 지도만 보여야 어디서 시작할지 바로 알 수 있다.’", "‘가중평균보다 어떤 대중교통으로 몇 분 걸리는지 보여주는 것이 훨씬 이해하기 쉽다.’"],
      ["모바일 지도·채팅 전환 과업 검증", "각 장소까지 교통수단·총시간·노선·환승·도보시간을 표시하고 추천 이유를 쉬운 문장으로 변경"]
    ]
  },
  {
    after: "과업 성공률",
    values: [
      ["미측정 - 사용자 테스트 미실시", "내부 3개 시나리오 모두 개선 요구 확인·반영; 외부 사용자 미측정"],
      ["미평가", "내부 기준 달성 / 외부 검증 필요"]
    ]
  },
  {
    after: "사용 만족/이해도",
    values: [
      ["미측정 - 사용자 테스트 미실시", "정량 점수 미측정; 내부 피드백 3건의 UI·설명 개선 반영"],
      ["미평가", "정성 개선 확인 / 외부 검증 필요"]
    ]
  }
];

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
const counts = new Map();

for (let index = 0; index < paragraphs.length; index++) {
  const text = plainText(paragraphs[index]);
  if (!replacements.has(text)) continue;
  const replacement = replacements.get(text);
  paragraphs[index] = replaceParagraph(paragraphs[index], replacement);
  counts.set(text, (counts.get(text) || 0) + 1);
}

for (const rule of sequentialReplacements) {
  const start = paragraphs.findIndex((p) => plainText(p) === rule.after);
  if (start < 0) throw new Error(`Anchor not found: ${rule.after}`);
  for (const [from, to] of rule.values) {
    const index = paragraphs.findIndex((p, i) => i > start && i <= start + 5 && plainText(p) === from);
    if (index < 0) throw new Error(`Scoped text not found after ${rule.after}: ${from}`);
    paragraphs[index] = replaceParagraph(paragraphs[index], to);
  }
}

const requiredUnique = [
  "U1 - 실제 사용자 테스트 미실시",
  "U2 - 실제 사용자 테스트 미실시",
  "U3 - 실제 사용자 테스트 미실시",
  "실제 사용자 테스트 미실시",
  "사용성 효과는 아직 사실로 판단할 수 없음"
];
for (const key of requiredUnique) {
  if ((counts.get(key) || 0) !== 1) throw new Error(`Expected one replacement for '${key}', got ${counts.get(key) || 0}`);
}

let cursor = 0;
zip.file("word/document.xml", xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, () => paragraphs[cursor++]));
const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
await fs.writeFile(output, bytes);
console.log(JSON.stringify({ source, output, paragraphs: paragraphs.length, replacements: [...counts.values()].reduce((a, b) => a + b, 0) + 8, bytes: bytes.length }, null, 2));
