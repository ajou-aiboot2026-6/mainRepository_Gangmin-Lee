import json
import os

import vertexai


PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "proj-aj02-211200020328")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
AGENT_ENGINE_NAME = os.environ["AGENT_ENGINE_NAME"]

client = vertexai.Client(project=PROJECT_ID, location=LOCATION)
remote_agent = client.agent_engines.get(name=AGENT_ENGINE_NAME)

events = []
texts: list[str] = []
for event in remote_agent.stream_query(
    user_id="mvp-verification",
    message=(
        "서울 여행에서 성수동 카페와 홍대 옷가게를 방문하고 싶어요. "
        "각 지역에 오래 머물 예정인데 이동이 편한 숙소를 추천해 주세요."
    ),
):
    events.append(event)
    content = event.get("content", {}) if isinstance(event, dict) else {}
    for part in content.get("parts", []) or []:
        if isinstance(part, dict) and part.get("text"):
            texts.append(part["text"])
    if texts:
        break

print(json.dumps({"event_count": len(events), "texts": texts}, ensure_ascii=False))
