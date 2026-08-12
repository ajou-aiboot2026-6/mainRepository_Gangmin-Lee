#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT를 설정하세요}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
PROJECT_ID="${GOOGLE_CLOUD_PROJECT}"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
SERVICE_ACCOUNT="seoul-stay-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
REPOSITORY="seoul-stay"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/app:latest"
BUCKET="${GCS_RAW_BUCKET:-${PROJECT_ID}-seoul-stay-raw}"
DATASET="${BIGQUERY_DATASET:-seoul_stay_mvp}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"
GEMINI_EMBEDDING_MODEL="${GEMINI_EMBEDDING_MODEL:-gemini-embedding-001}"

gcloud config set project "${PROJECT_ID}"
gcloud services enable aiplatform.googleapis.com vectorsearch.googleapis.com
gcloud artifacts repositories describe "${REPOSITORY}" --location "${REGION}" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "${REPOSITORY}" --repository-format docker --location "${REGION}"
gcloud iam service-accounts describe "${SERVICE_ACCOUNT}" >/dev/null 2>&1 || \
  gcloud iam service-accounts create seoul-stay-runtime --display-name "Seoul Stay Runtime"

for role in roles/aiplatform.user roles/bigquery.dataEditor roles/bigquery.jobUser roles/storage.objectAdmin roles/secretmanager.secretAccessor roles/logging.logWriter roles/cloudtrace.agent roles/run.invoker; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${SERVICE_ACCOUNT}" --role="${role}" --quiet >/dev/null
done

gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://${BUCKET}" --location=US --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" --role="roles/storage.legacyBucketReader" --quiet >/dev/null
bq --location=US show "${PROJECT_ID}:${DATASET}" >/dev/null 2>&1 || \
  bq --location=US mk --dataset "${PROJECT_ID}:${DATASET}"

gcloud builds submit --tag "${IMAGE}" .
COMMON_ENV="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},GOOGLE_GENAI_USE_VERTEXAI=true,GEMINI_MODEL=${GEMINI_MODEL},GEMINI_EMBEDDING_MODEL=${GEMINI_EMBEDDING_MODEL},GCS_RAW_BUCKET=${BUCKET},BIGQUERY_DATASET=${DATASET},BIGQUERY_LOCATION=US"
SECRETS="GOOGLE_MAPS_API_KEY=google-maps-api-key:latest,TOUR_API_SERVICE_KEY=tour-api-service-key:latest,SEOUL_OPEN_DATA_API_KEY=seoul-open-data-api-key:latest"

gcloud run deploy seoul-stay-web --image "${IMAGE}" --region "${REGION}" --service-account "${SERVICE_ACCOUNT}" \
  --allow-unauthenticated --set-env-vars "${COMMON_ENV}" --set-secrets "${SECRETS}"
gcloud run jobs deploy seoul-stay-ingest --image "${IMAGE}" --region "${REGION}" --service-account "${SERVICE_ACCOUNT}" \
  --command node --args dist-server/jobs/ingest.js --task-timeout 7200s --memory 2Gi --max-retries 1 --set-env-vars "${COMMON_ENV},INGEST_PAGE_SIZE=1000,INGEST_MAX_PAGES=200" --set-secrets "${SECRETS}"

SCHEDULER_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_NUMBER}/jobs/seoul-stay-ingest:run"
gcloud scheduler jobs describe seoul-stay-nightly-ingest --location "${REGION}" >/dev/null 2>&1 || \
  gcloud scheduler jobs create http seoul-stay-nightly-ingest --location "${REGION}" --schedule "0 3 * * 1" \
    --time-zone "Asia/Seoul" --uri "${SCHEDULER_URI}" --http-method POST --oauth-service-account-email "${SERVICE_ACCOUNT}"

echo "Cloud Run URL: $(gcloud run services describe seoul-stay-web --region "${REGION}" --format='value(status.url)')"
echo "GCS bucket: gs://${BUCKET}"
echo "BigQuery dataset: ${PROJECT_ID}.${DATASET}"
