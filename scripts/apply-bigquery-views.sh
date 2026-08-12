#!/usr/bin/env bash
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT를 설정하세요}"
sed "s/PROJECT_ID/${GOOGLE_CLOUD_PROJECT}/g" sql/create_curated_views.sql | bq query --use_legacy_sql=false --location=US
