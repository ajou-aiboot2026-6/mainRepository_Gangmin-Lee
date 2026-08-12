import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";

type Visit = { id: string; query: string; name: string; category: string; address: string; lat: number; lng: number; placeUrl?: string; stayMinutes: number; stayRationale: string };
type Route = { visitId: string; visitName: string; weight: number; transit: Metric | null; walk: Metric | null; bestMode: "TRANSIT" | "WALK"; effectiveMinutes: number };
type RouteStep = { mode: "WALK" | "SUBWAY" | "BUS" | "TRAIN" | "OTHER"; durationMinutes: number; distanceMeters: number; instruction: string; lineName?: string; departureStop?: string; arrivalStop?: string; headsign?: string; stopCount?: number };
type Metric = { durationMinutes: number; distanceMeters: number; transfers: number; landingUrl?: string; estimated?: boolean; steps?: RouteStep[] };
type Stay = { id: string; name: string; address: string; lat: number; lng: number; imageUrl?: string; sourceUrl: string; accommodationType: string; moodTags: string[]; score: number; weightedTravelMinutes: number; worstTravelMinutes: number; routes: Route[]; summary?: string; fitReasons?: string[]; caveat?: string };
type Health = { status: string; services: { gemini: boolean; googleMaps: boolean; tourApi: boolean }; demoData: boolean };
type ChatMessage = { id: number; role: "assistant" | "user"; text: string };
type Stage = "itinerary" | "preferences" | "results";

const visitIcon = L.divIcon({ className: "map-pin-wrap", html: '<span class="map-pin visit-pin">●</span>', iconSize: [28, 28], iconAnchor: [14, 14] });
const stayIcon = L.divIcon({ className: "map-pin-wrap", html: '<span class="map-pin stay-pin">◆</span>', iconSize: [34, 34], iconAnchor: [17, 17] });

function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [draft, setDraft] = useState("");
  const [stage, setStage] = useState<Stage>("itinerary");
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 1, role: "assistant", text: "서울에서 방문하고 싶은 장소를 알려주세요. 카페, 편집숍, 전시 공간처럼 구체적으로 말해주시면 좋아요." }]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [selectedStay, setSelectedStay] = useState<string | null>(null);
  const [loading, setLoading] = useState<"analyze" | "preferences" | "recommend" | null>(null);
  const [error, setError] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch("/api/health").then((response) => response.json()).then(setHealth).catch(() => setHealth(null)); }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, visits, stays, selectedStay, loading, error]);
  const ready = health?.status === "ready";
  const mapPoints = useMemo(() => [...visits, ...stays], [visits, stays]);
  const selected = stays.find((stay) => stay.id === selectedStay);

  function addMessage(role: ChatMessage["role"], text: string) {
    setMessages((current) => [...current, { id: Date.now() + Math.random(), role, text }]);
  }

  async function submit() {
    const text = draft.trim();
    if (!text || loading || !ready) return;
    setDraft("");
    setError("");
    addMessage("user", text);
    if (stage === "preferences") await analyzePreferences(text);
    else await analyzeItinerary(text);
  }

  async function analyzeItinerary(text: string) {
    setLoading("analyze");
    setVisits([]);
    setStays([]);
    setSelectedStay(null);
    try {
      const data = await api("/api/itinerary/analyze", { message: text });
      setVisits(data.places);
      addMessage("assistant", `${data.assistantMessage}\n\n체류시간을 확인해 주세요. 이어서 원하는 숙소 유형이나 분위기를 알려주세요. 예: “조용하고 전망 좋은 호텔”. 조건이 없다면 “상관없이 추천해줘”라고 답해도 됩니다.`);
      setStage("preferences");
    } catch (reason) { setError(messageOf(reason)); }
    finally { setLoading(null); }
  }

  async function analyzePreferences(text: string) {
    setLoading("preferences");
    try {
      const preferences = await api("/api/preferences/analyze", { message: text });
      addMessage("assistant", preferences.assistantMessage);
      setLoading("recommend");
      const data = await api("/api/recommendations", {
        visits,
        filters: { accommodationTypes: preferences.accommodationTypes, moods: preferences.moods }
      });
      setStays(data.recommendations);
      setSelectedStay(data.recommendations[0]?.id ?? null);
      addMessage("assistant", data.recommendations.length
        ? `동선을 계산해 ${data.recommendations.length}곳을 찾았어요. 지도에서 위치를 보고, 아래 숙소를 눌러 장소별 이동시간을 비교해 보세요.`
        : "조건에 맞는 숙소를 찾지 못했어요. 다른 유형이나 분위기로 다시 이야기해 주세요.");
      setStage("results");
    } catch (reason) { setError(messageOf(reason)); }
    finally { setLoading(null); }
  }

  function updateStayMinutes(id: string, value: number) {
    setVisits((current) => current.map((visit) => visit.id === id ? { ...visit, stayMinutes: Math.min(480, Math.max(15, value || 15)) } : visit));
  }

  function startOver() {
    setDraft("");
    setStage("itinerary");
    setVisits([]);
    setStays([]);
    setSelectedStay(null);
    setError("");
    setMessages([{ id: Date.now(), role: "assistant", text: "새 여행을 시작할게요. 서울에서 방문하고 싶은 장소를 알려주세요." }]);
  }

  const placeholder = stage === "preferences"
    ? "예: 한옥이면 좋고 조용한 분위기를 원해"
    : stage === "results" ? "다른 여행 장소를 입력하면 새로 찾아드려요" : "예: 성수 어니언, LCDC 서울, 홍대 상상마당에 갈 거야";

  return <div className="app-shell">
    <main className="interface">
      <section className="chatbot" aria-label="숙소 추천 챗봇">
        <header className="chat-header">
          <div className="brand"><span className="brand-mark">ㅁ</span><div><strong>머물곳</strong><small>서울 동선 맞춤 숙소 챗봇</small></div></div>
          <div className="header-actions"><span className={`status-dot ${ready ? "ready" : "pending"}`} title={ready ? "API 연결됨" : "API 설정 필요"}/><button onClick={startOver}>새 대화</button></div>
        </header>

        <div className="chat-scroll">
          {!ready && health && <div className="system-notice"><strong>API 설정이 필요합니다.</strong><span>{missingKeys(health).join(", ")}를 확인해 주세요. 데모 데이터는 사용하지 않습니다.</span></div>}
          {messages.map((item) => <div className={`message-row ${item.role}`} key={item.id}>
            {item.role === "assistant" && <span className="avatar">M</span>}
            <p>{item.text}</p>
          </div>)}

          {visits.length > 0 && <div className="inline-panel itinerary-summary">
            <div className="panel-heading"><strong>방문 일정</strong><span>총 {formatDuration(visits.reduce((sum, visit) => sum + visit.stayMinutes, 0))}</span></div>
            {visits.map((visit, index) => <div className="visit-item" key={visit.id}>
              <span>{index + 1}</span>
              <div><strong>{visit.name}</strong><small>{visit.category} · {visit.address}</small></div>
              <label><input type="number" min="15" max="480" step="15" value={visit.stayMinutes} onChange={(event) => updateStayMinutes(visit.id, Number(event.target.value))}/><em>분</em></label>
            </div>)}
          </div>}

          {loading && <div className="working"><Spinner/><span>{loading === "analyze" ? "장소와 체류시간을 정리하고 있어요" : loading === "preferences" ? "숙소 취향을 이해하고 있어요" : "실제 동선을 비교하고 있어요"}</span></div>}
          {error && <div className="system-notice error"><strong>요청을 완료하지 못했어요.</strong><span>{error}</span></div>}

          {stays.length > 0 && <div className="inline-panel result-list">
            <div className="panel-heading"><strong>추천 숙소</strong><span>일정에 잘 맞는 순</span></div>
            {stays.map((stay, index) => <button key={stay.id} className={selectedStay === stay.id ? "selected" : ""} onClick={() => setSelectedStay(stay.id)}>
              <span className="rank">{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{stay.name}</strong><small>{stay.accommodationType} · {stay.address}</small></div>
              <em>{friendlyRouteHeadline(stay)}<small>가장 오래 걸리는 곳 {stay.worstTravelMinutes}분</small></em>
            </button>)}
          </div>}

          {selected && <StayDetail stay={selected}/>}          
          <div ref={chatEnd}/>
        </div>

        <div className="chat-composer">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={placeholder} disabled={!ready || loading !== null}/>
          <button onClick={submit} disabled={!ready || loading !== null || !draft.trim()} aria-label="메시지 보내기">{loading ? <Spinner/> : "↑"}</button>
          <small>Enter 전송 · Shift+Enter 줄바꿈</small>
        </div>
      </section>

      <section className="map-panel" aria-label="방문지와 추천 숙소 지도">
        <div className="map-legend"><span><i className="visit"/>방문지</span><span><i className="stay"/>추천 숙소</span></div>
        <MapContainer center={[37.5563, 126.9932]} zoom={11} scrollWheelZoom className="map">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {visits.map((visit) => <Marker key={visit.id} position={[visit.lat, visit.lng]} icon={visitIcon}><Popup><strong>{visit.name}</strong><br/>{visit.stayMinutes}분 체류</Popup></Marker>)}
          {stays.map((stay) => <Marker key={stay.id} position={[stay.lat, stay.lng]} icon={stayIcon} eventHandlers={{ click: () => setSelectedStay(stay.id) }}><Popup><strong>{stay.name}</strong><br/>{friendlyRouteHeadline(stay)}</Popup></Marker>)}
          <FitMap points={mapPoints}/>
        </MapContainer>
        {mapPoints.length === 0 && <div className="map-empty"><span>SEOUL</span><p>챗봇에게 방문 장소를 말하면<br/>지도에 여행 동선이 표시됩니다.</p></div>}
      </section>
    </main>

    <footer className="source-footer">
      <span>데이터 출처</span>
      <a href="https://www.data.go.kr/data/15101578/openapi.do" target="_blank" rel="noreferrer">한국관광공사 TourAPI</a>
      <a href="https://developers.google.com/maps" target="_blank" rel="noreferrer">Google Maps Platform</a>
      <a href="https://ai.google.dev/" target="_blank" rel="noreferrer">Google Gemini</a>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
      {selected && <a href={selected.sourceUrl} target="_blank" rel="noreferrer">선택 숙소 원문</a>}
      <small>대중교통은 API 예상값, 도보는 경로 미제공 시 좌표 기반 추정값입니다. 가격·객실 재고는 제공하지 않습니다.</small>
    </footer>
  </div>;
}

function StayDetail({ stay }: { stay: Stay }) {
  return <div className="inline-panel stay-detail">
    <div className="panel-heading"><strong>{stay.name}</strong><span>{stay.accommodationType}</span></div>
    <p>{stay.summary}</p>
    {stay.fitReasons?.length ? <ul>{stay.fitReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
    <div className="route-list">{stay.routes.map((route) => <div key={route.visitId}>
      <strong>{route.visitName}</strong>
      {route.transit ? <RouteSummary metric={route.transit}/> : <span>이용 가능한 대중교통 경로가 없어요.</span>}
      {route.walk && <span>전체 도보 시 {route.walk.estimated ? "약 " : ""}{route.walk.durationMinutes}분</span>}
    </div>)}</div>
    <small className="detail-caveat">{stay.caveat}</small>
  </div>;
}

function RouteSummary({ metric }: { metric: Metric }) {
  const steps = metric.steps || [];
  const transport = steps.filter((step) => step.mode !== "WALK");
  const walkRawMinutes = steps.filter((step) => step.mode === "WALK").reduce((sum, step) => sum + step.durationMinutes, 0);
  const walkMinutes = walkRawMinutes ? Math.max(1, Math.round(walkRawMinutes)) : 0;
  return <div className="route-summary">
    <span><b>총 {metric.durationMinutes}분</b> · 환승 {metric.transfers}회{walkMinutes ? ` · 도보 ${walkMinutes}분` : ""}</span>
    {transport.map((step, index) => <span key={`${step.instruction}-${index}`}>
      {modeIcon(step.mode)} {step.lineName || step.instruction} {Math.max(1, Math.round(step.durationMinutes))}분
      {step.departureStop && step.arrivalStop ? ` · ${step.departureStop} → ${step.arrivalStop}` : ""}
    </span>)}
    {metric.landingUrl && <a href={metric.landingUrl} target="_blank" rel="noreferrer">Google 지도에서 경로 보기</a>}
  </div>;
}

function friendlyRouteHeadline(stay: Stay) {
  const minutes = stay.routes.map((route) => route.transit?.durationMinutes).filter((value): value is number => Boolean(value));
  if (!minutes.length) return "도보 중심 후보";
  return `주요 장소까지 ${Math.min(...minutes)}~${Math.max(...minutes)}분`;
}

function modeIcon(mode: RouteStep["mode"]) {
  return mode === "BUS" ? "🚌" : mode === "SUBWAY" ? "🚇" : mode === "TRAIN" ? "🚆" : mode === "WALK" ? "🚶" : "🚉";
}

function FitMap({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
    else if (points.length > 1) map.fitBounds(points.map((point) => [point.lat, point.lng] as [number, number]), { padding: [50, 50] });
  }, [map, points]);
  return null;
}

function Spinner() { return <span className="spinner"/>; }
function formatDuration(minutes: number) { const hours = Math.floor(minutes / 60), rest = minutes % 60; return `${hours ? `${hours}시간 ` : ""}${rest ? `${rest}분` : ""}`.trim(); }
function missingKeys(health: Health) { return [["gemini", "GEMINI_API_KEY"], ["googleMaps", "GOOGLE_MAPS_API_KEY"], ["tourApi", "TOUR_API_SERVICE_KEY"]].filter(([key]) => !health.services[key as keyof Health["services"]]).map(([, name]) => name); }
async function api(url: string, body: unknown) { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || "API 요청에 실패했습니다."); return data; }
function messageOf(error: unknown) { return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."; }

createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
