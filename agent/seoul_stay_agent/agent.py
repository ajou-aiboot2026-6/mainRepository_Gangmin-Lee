import os
from typing import Any

import google.auth
import requests
from google.adk.agents import Agent
from google.auth.transport.requests import AuthorizedSession
from google.cloud import bigquery


PROJECT_ID = os.getenv("APP_GOOGLE_CLOUD_PROJECT") or os.environ["GOOGLE_CLOUD_PROJECT"]
LOCATION = os.getenv(
    "APP_GOOGLE_CLOUD_LOCATION",
    os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
)
DATASET = os.getenv("BIGQUERY_DATASET", "seoul_stay_mvp")
RAG_CORPUS = os.environ["VERTEX_RAG_CORPUS"]


def search_public_data(area_keyword: str) -> dict[str, Any]:
    """?쒖슱 ?곴텒???먰룷 ?섏? ?좊룞?멸뎄瑜?BigQuery?먯꽌 議고쉶?쒕떎."""
    client = bigquery.Client(project=PROJECT_ID)
    sql = f"""
    SELECT
      'store' AS source,
      area_name AS area,
      SUM(store_count) AS metric
    FROM `{PROJECT_ID}.{DATASET}.commercial_store_profile`
    WHERE area_name LIKE CONCAT('%', @keyword, '%')
    GROUP BY area
    UNION ALL
    SELECT
      'population' AS source,
      JSON_VALUE(payload, '$.TRDAR_CD_NM') AS area,
      SUM(SAFE_CAST(JSON_VALUE(payload, '$.TOT_FLPOP_CO') AS INT64)) AS metric
    FROM `{PROJECT_ID}.{DATASET}.raw_commercial_population`
    WHERE JSON_VALUE(payload, '$.TRDAR_CD_NM') LIKE CONCAT('%', @keyword, '%')
    GROUP BY area
    LIMIT 20
    """
    config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("keyword", "STRING", area_keyword)
        ]
    )
    rows = client.query(sql, job_config=config).result()
    return {"rows": [dict(row) for row in rows]}


def retrieve_public_rag(query: str) -> dict[str, Any]:
    """Vertex AI RAG Engine?먯꽌 TourAPI쨌?쒖슱 怨듦났?곗씠?곗쓽 愿??洹쇨굅瑜?寃?됲븳??"""
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    session = AuthorizedSession(credentials)
    endpoint = (
        f"https://{LOCATION}-aiplatform.googleapis.com/v1/"
        f"projects/{PROJECT_ID}/locations/{LOCATION}:retrieveContexts"
    )
    try:
        response = session.post(
            endpoint,
            json={
                "vertexRagStore": {
                    "ragResources": [{"ragCorpus": RAG_CORPUS}],
                },
                "query": {
                    "text": query,
                    "ragRetrievalConfig": {"topK": 3},
                },
            },
            timeout=60,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        return {
            "contexts": [],
            "status": "temporarily_unavailable",
            "message": "공공데이터 근거 검색이 색인 작업으로 일시 지연되고 있습니다.",
            "error_type": type(error).__name__,
        }
    payload = response.json()
    contexts = payload.get("contexts", {}).get("contexts", [])
    return {
        "contexts": [
            {
                "text": item.get("text", ""),
                "source_uri": item.get("sourceUri"),
                "source_display_name": item.get("sourceDisplayName"),
            }
            for item in contexts
        ]
    }


root_agent = Agent(
    name="seoul_stay_orchestrator",
    model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
    description="?쒖슱 ?ы뻾 ?쇱젙怨?怨듦났?곗씠?곕? 諛뷀깢?쇰줈 ?대룞???명븳 ?숈냼瑜??ㅻ챸?섎뒗 AI ?먯씠?꾪듃",
    instruction="""
?덈뒗 '癒몃Ъ怨? ?숈냼 異붿쿇 ?ㅼ??ㅽ듃?덉씠?곕떎.

?ъ슜?먭? 諛⑸Ц?섎젮???μ냼, ?덉긽 泥대쪟?쒓컙, ?숈냼 ?좏삎怨?遺꾩쐞湲곕? ??붾줈 ?먯뿰?ㅻ읇寃??뺤씤?쒕떎.
愿愿묒?? 吏???ㅻ챸?먮뒗 諛섎뱶??retrieve_public_rag瑜??ъ슜??怨듦났?곗씠??洹쇨굅瑜?寃?됲븳??
?곴텒 洹쒕え??吏???뱀꽦??蹂댁땐?댁빞 ???뚮뒗 search_public_data濡?BigQuery ?곗씠?곕? 議고쉶?쒕떎.
?대룞?쒓컙, 援먰넻?섎떒, ?몄꽑, ?섏듅 ?잛닔? ?꾨낫?쒓컙? ?쒕퉬?ㅺ? ?꾨떖??Google Routes 寃곌낵留??ъ슜?섎ŉ
?뺤씤?섏? ?딆? ?섏튂瑜?留뚮뱾?대궡吏 ?딅뒗??

?ъ슜?먯뿉寃?媛以묓룊洹? ?뺢퇋?? 諛깅텇?? ?대? ?먯닔 媛숈? 湲곗닠 ?⑹뼱瑜??몄텧?섏? ?딅뒗??
???'?깆닔?먯꽌 ?ㅻ옒 癒몃Ъ ?덉젙?대씪 ?깆닔 ?묎렐?깆쓣 ??以묒슂?섍쾶 怨좊젮?덉뼱??泥섎읆 ?쎄쾶 ?ㅻ챸?쒕떎.
理쒖쥌 ?듬??먮뒗 ?숈냼蹂?珥??대룞?쒓컙, ?以묎탳???섎떒怨??몄꽑, ?섏듅 ?잛닔, ?꾨낫?쒓컙,
異붿쿇 ?댁쑀? 怨듦났?곗씠??洹쇨굅瑜?吏㏐퀬 紐낇솗?섍쾶 ?ы븿?쒕떎.
洹쇨굅媛 遺議깊븯硫?異붿륫?섏? 留먭퀬 ?대뼡 ?뺣낫媛 ???꾩슂?쒖? 吏덈Ц?쒕떎.
""",
    tools=[search_public_data, retrieve_public_rag],
)

