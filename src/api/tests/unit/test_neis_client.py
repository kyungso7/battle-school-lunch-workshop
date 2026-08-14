from datetime import date

import httpx
import pytest

from app.config import Settings
from app.neis_client import NeisClient, NeisClientError, _normalise_menu


def _response(payload: dict) -> httpx.Response:
    return httpx.Response(200, json=payload)


@pytest.mark.unit
def test_normalise_menu_preserves_text_and_changes_html_breaks() -> None:
    assert _normalise_menu("밥<br/>국<br >반찬 &amp; 과일") == "밥\n국\n반찬 & 과일"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_meals_filters_lunch_and_sorts_dates() -> None:
    payload = {
        "mealServiceDietInfo": [
            {"head": [{"RESULT": {"CODE": "INFO-000", "MESSAGE": "OK"}}]},
            {
                "row": [
                    {
                        "ATPT_OFCDC_SC_CODE": "B10",
                        "SD_SCHUL_CODE": "701",
                        "MMEAL_SC_CODE": "2",
                        "MMEAL_SC_NM": "중식",
                        "MLSV_YMD": "20260815",
                        "DDISH_NM": "둘째<br/>메뉴",
                    },
                    {
                        "ATPT_OFCDC_SC_CODE": "B10",
                        "SD_SCHUL_CODE": "701",
                        "MMEAL_SC_CODE": "1",
                        "MMEAL_SC_NM": "조식",
                        "MLSV_YMD": "20260814",
                        "DDISH_NM": "조식",
                    },
                    {
                        "ATPT_OFCDC_SC_CODE": "B10",
                        "SD_SCHUL_CODE": "701",
                        "MMEAL_SC_CODE": "2",
                        "MMEAL_SC_NM": "중식",
                        "MLSV_YMD": "20260814",
                        "DDISH_NM": "첫째",
                        "CAL_INFO": "600 Kcal",
                    },
                ]
            },
        ]
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["MMEAL_SC_CODE"] == "2"
        assert request.url.params["MLSV_FROM_YMD"] == "20260814"
        assert request.url.params["MLSV_TO_YMD"] == "20260815"
        return _response(payload)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = NeisClient(http_client, Settings(NEIS_API_KEY="test-key"))
        meals = await client.get_meals("B10", "701", date(2026, 8, 14), date(2026, 8, 15))

    assert [meal.date.isoformat() for meal in meals] == ["2026-08-14", "2026-08-15"]
    assert meals[0].calories == "600 Kcal"
    assert meals[1].menu == "둘째\n메뉴"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_neis_info_200_is_empty_result() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return _response({"RESULT": {"CODE": "INFO-200", "MESSAGE": "No data"}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        client = NeisClient(http_client, Settings())
        assert await client.search_schools("없는학교") == []


@pytest.mark.unit
@pytest.mark.asyncio
async def test_malformed_neis_response_is_sanitised_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return _response({"schoolInfo": [{"row": []}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        client = NeisClient(http_client, Settings())
        with pytest.raises(NeisClientError) as raised:
            await client.search_schools("학교")

    assert raised.value.code == "UPSTREAM_INVALID_RESPONSE"
    assert raised.value.status_code == 502
