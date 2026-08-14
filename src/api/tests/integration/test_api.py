from collections.abc import Iterator

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import ReadTimeout, Response

from app.config import Settings
from app.main import create_app

BASE_URL = "https://open.neis.go.kr/hub"


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = create_app(Settings(NEIS_API_KEY="integration-key"))
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.integration
def test_health_returns_ready_status(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-request-id"]


@pytest.mark.integration
@respx.mock
def test_schools_transforms_neis_response_and_parameters(client: TestClient) -> None:
    route = respx.get(f"{BASE_URL}/schoolInfo").mock(
        return_value=Response(
            200,
            json={
                "schoolInfo": [
                    {"head": [{"RESULT": {"CODE": "INFO-000", "MESSAGE": "OK"}}]},
                    {
                        "row": [
                            {
                                "ATPT_OFCDC_SC_CODE": "B10",
                                "SD_SCHUL_CODE": "7010569",
                                "SCHUL_NM": "서울급식고등학교",
                                "SCHUL_KND_SC_NM": "고등학교",
                                "LCTN_SC_NM": "서울특별시",
                                "ORG_RDNMA": "서울시 중구 급식로 1",
                            }
                        ]
                    },
                ]
            },
        )
    )

    response = client.get("/api/schools", params={"query": "  급식고  "})

    assert response.status_code == 200
    assert response.json() == [
        {
            "officeCode": "B10",
            "schoolCode": "7010569",
            "name": "서울급식고등학교",
            "schoolType": "고등학교",
            "location": "서울특별시",
            "address": "서울시 중구 급식로 1",
        }
    ]
    assert route.called
    request = route.calls[0].request
    assert request.url.params["SCHUL_NM"] == "급식고"
    assert request.url.params["KEY"] == "integration-key"
    assert request.url.params["Type"] == "json"
    assert request.url.params["pIndex"] == "1"
    assert request.url.params["pSize"] == "100"


@pytest.mark.integration
@respx.mock
def test_meals_uses_lunch_and_returns_empty_for_neis_info_200(client: TestClient) -> None:
    route = respx.get(f"{BASE_URL}/mealServiceDietInfo").mock(
        return_value=Response(200, json={"RESULT": {"CODE": "INFO-200", "MESSAGE": "none"}})
    )

    response = client.get(
        "/api/meals",
        params={
            "officeCode": "B10",
            "schoolCode": "7010569",
            "from": "2026-08-01",
            "to": "2026-08-31",
        },
    )

    assert response.status_code == 200
    assert response.json() == []
    request = route.calls[0].request
    assert request.url.params["MMEAL_SC_CODE"] == "2"
    assert request.url.params["MLSV_FROM_YMD"] == "20260801"
    assert request.url.params["MLSV_TO_YMD"] == "20260831"


@pytest.mark.integration
@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"query": "   "}, "query"),
        (
            {
                "officeCode": "B10",
                "schoolCode": "701",
                "from": "2026-08-02",
                "to": "2026-08-01",
            },
            "to",
        ),
        (
            {
                "officeCode": "B10",
                "schoolCode": "701",
                "from": "2026-08-01",
                "to": "2026-09-01",
            },
            "to",
        ),
    ],
)
def test_invalid_queries_return_stable_error(
    client: TestClient, params: dict[str, str], field: str
) -> None:
    path = "/api/schools" if "query" in params else "/api/meals"
    response = client.get(path, params=params)

    body = response.json()
    assert response.status_code == 422
    assert body["code"] == "VALIDATION_ERROR"
    assert body["field"] == field
    assert body["requestId"]


@pytest.mark.integration
@respx.mock
def test_upstream_failures_are_sanitised(client: TestClient) -> None:
    respx.get(f"{BASE_URL}/schoolInfo").mock(return_value=Response(500, text="secret detail"))

    response = client.get("/api/schools", params={"query": "학교"})

    assert response.status_code == 502
    assert response.json()["code"] == "UPSTREAM_UNAVAILABLE"
    assert "secret detail" not in response.text
    assert "integration-key" not in response.text


@pytest.mark.integration
@respx.mock
def test_upstream_timeout_has_stable_response(client: TestClient) -> None:
    respx.get(f"{BASE_URL}/schoolInfo").mock(side_effect=ReadTimeout("upstream timeout"))

    response = client.get("/api/schools", params={"query": "학교"})

    assert response.status_code == 504
    assert response.json()["code"] == "UPSTREAM_TIMEOUT"
