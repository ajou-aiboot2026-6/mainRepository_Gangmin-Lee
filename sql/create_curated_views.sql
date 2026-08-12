-- PROJECT_ID는 실행 전에 실제 프로젝트 ID로 교체합니다.
CREATE OR REPLACE VIEW `PROJECT_ID.seoul_stay_mvp.stay_candidates` AS
SELECT
  JSON_VALUE(payload, '$.contentid') AS content_id,
  JSON_VALUE(payload, '$.title') AS title,
  JSON_VALUE(payload, '$.addr1') AS address,
  SAFE_CAST(JSON_VALUE(payload, '$.mapy') AS FLOAT64) AS latitude,
  SAFE_CAST(JSON_VALUE(payload, '$.mapx') AS FLOAT64) AS longitude,
  JSON_VALUE(payload, '$.firstimage') AS image_url,
  ST_GEOGPOINT(
    SAFE_CAST(JSON_VALUE(payload, '$.mapx') AS FLOAT64),
    SAFE_CAST(JSON_VALUE(payload, '$.mapy') AS FLOAT64)
  ) AS geography,
  _ingested_at
FROM `PROJECT_ID.seoul_stay_mvp.raw_tour_content`
WHERE JSON_VALUE(payload, '$.contenttypeid') = '32'
  AND JSON_VALUE(payload, '$.mapx') IS NOT NULL
  AND JSON_VALUE(payload, '$.mapy') IS NOT NULL;

CREATE OR REPLACE VIEW `PROJECT_ID.seoul_stay_mvp.commercial_store_profile` AS
SELECT
  JSON_VALUE(payload, '$.ADSTRD_CD') AS area_code,
  JSON_VALUE(payload, '$.ADSTRD_CD_NM') AS area_name,
  JSON_VALUE(payload, '$.SVC_INDUTY_CD_NM') AS business_type,
  SUM(SAFE_CAST(JSON_VALUE(payload, '$.SIMILR_INDUTY_STOR_CO') AS INT64)) AS store_count,
  AVG(SAFE_CAST(JSON_VALUE(payload, '$.OPBIZ_RT') AS FLOAT64)) AS opening_rate,
  AVG(SAFE_CAST(JSON_VALUE(payload, '$.CLSBIZ_RT') AS FLOAT64)) AS closing_rate
FROM `PROJECT_ID.seoul_stay_mvp.raw_commercial_stores`
GROUP BY area_code, area_name, business_type;

CREATE OR REPLACE VIEW `PROJECT_ID.seoul_stay_mvp.recommendation_daily_metrics` AS
SELECT
  DATE(created_at) AS event_date,
  COUNT(*) AS recommendation_count,
  COUNT(DISTINCT stay_name) AS unique_recommended_stays
FROM `PROJECT_ID.seoul_stay_mvp.recommendation_events`, UNNEST(recommended_stay_names) AS stay_name
GROUP BY event_date;
