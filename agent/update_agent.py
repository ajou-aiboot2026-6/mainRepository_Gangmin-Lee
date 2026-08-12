import os
from pathlib import Path

import vertexai
from vertexai import agent_engines
from seoul_stay_agent.agent import root_agent


BASE_DIR = Path(__file__).resolve().parent
os.chdir(BASE_DIR)
PROJECT_ID = os.environ["GOOGLE_CLOUD_PROJECT"]
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
AGENT_ENGINE_NAME = os.environ["AGENT_ENGINE_NAME"]
SERVICE_ACCOUNT = os.getenv(
    "AGENT_ENGINE_SERVICE_ACCOUNT",
    f"seoul-stay-runtime@{PROJECT_ID}.iam.gserviceaccount.com",
)
STAGING_BUCKET = os.getenv(
    "AGENT_ENGINE_STAGING_BUCKET",
    f"gs://{PROJECT_ID}-seoul-stay-raw",
)

requirements = [
    line.strip()
    for line in (BASE_DIR / "requirements.txt").read_text(encoding="utf-8").splitlines()
    if line.strip() and not line.lstrip().startswith("#")
]

client = vertexai.Client(project=PROJECT_ID, location=LOCATION)
app = agent_engines.AdkApp(agent=root_agent, enable_tracing=True)
remote = client.agent_engines.update(
    name=AGENT_ENGINE_NAME,
    agent=app,
    config={
        "display_name": "seoul-stay-orchestrator",
        "staging_bucket": STAGING_BUCKET,
        "requirements": requirements,
        "extra_packages": ["./seoul_stay_agent"],
        "service_account": SERVICE_ACCOUNT,
        "env_vars": {
            "APP_GOOGLE_CLOUD_PROJECT": PROJECT_ID,
            "APP_GOOGLE_CLOUD_LOCATION": LOCATION,
            "BIGQUERY_DATASET": os.getenv("BIGQUERY_DATASET", "seoul_stay_mvp"),
            "VERTEX_RAG_CORPUS": os.environ["VERTEX_RAG_CORPUS"],
            "GEMINI_MODEL": os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        },
    },
)
print(remote.api_resource.name)
