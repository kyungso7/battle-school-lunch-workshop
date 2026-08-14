"""The sole HTTP boundary for the NEIS Open API."""

from __future__ import annotations

import html
import re
from datetime import date
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.schemas import Meal, NeisMealRow, NeisSchoolRow, School


class NeisClientError(Exception):
    """A sanitized, public-safe error raised for an NEIS boundary failure."""

    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class NeisClient:
    def __init__(self, client: httpx.AsyncClient, settings: Settings) -> None:
        self._client = client
        self._settings = settings

    async def search_schools(self, query: str) -> list[School]:
        payload = await self._get("/schoolInfo", {"SCHUL_NM": query})
        rows = self._extract_rows(payload, "schoolInfo")
        try:
            return [NeisSchoolRow.model_validate(row).to_school() for row in rows]
        except ValidationError as exc:
            raise NeisClientError(
                "UPSTREAM_INVALID_RESPONSE",
                "The school information service returned invalid data.",
                502,
            ) from exc

    async def get_meals(
        self, office_code: str, school_code: str, from_date: date, to_date: date
    ) -> list[Meal]:
        payload = await self._get(
            "/mealServiceDietInfo",
            {
                "ATPT_OFCDC_SC_CODE": office_code,
                "SD_SCHUL_CODE": school_code,
                "MMEAL_SC_CODE": "2",
                "MLSV_FROM_YMD": from_date.strftime("%Y%m%d"),
                "MLSV_TO_YMD": to_date.strftime("%Y%m%d"),
            },
        )
        rows = self._extract_rows(payload, "mealServiceDietInfo")
        try:
            meals = [NeisMealRow.model_validate(row) for row in rows]
        except ValidationError as exc:
            raise NeisClientError(
                "UPSTREAM_INVALID_RESPONSE",
                "The meal information service returned invalid data.",
                502,
            ) from exc

        return sorted(
            [
                Meal(
                    date=meal.meal_date,
                    meal_type=meal.meal_type,
                    menu=_normalise_menu(meal.menu),
                    calories=meal.calories,
                    nutrition=meal.nutrition,
                    origin=meal.origin,
                )
                for meal in meals
                if meal.meal_code == "2"
            ],
            key=lambda meal: meal.date,
        )

    async def _get(self, path: str, parameters: dict[str, str]) -> dict[str, Any]:
        params = {
            "KEY": self._settings.neis_api_key.get_secret_value(),
            "Type": "json",
            "pIndex": "1",
            "pSize": "100",
            **parameters,
        }
        try:
            response = await self._client.get(
                f"{self._settings.neis_base_url}{path}", params=params
            )
            response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise NeisClientError(
                "UPSTREAM_TIMEOUT",
                "The external meal information service timed out. Please try again.",
                504,
            ) from exc
        except httpx.HTTPError as exc:
            raise NeisClientError(
                "UPSTREAM_UNAVAILABLE",
                "The external meal information service is unavailable. Please try again.",
                502,
            ) from exc

        try:
            data = response.json()
        except ValueError as exc:
            raise NeisClientError(
                "UPSTREAM_INVALID_RESPONSE",
                "The external meal information service returned invalid data.",
                502,
            ) from exc
        if not isinstance(data, dict):
            raise NeisClientError(
                "UPSTREAM_INVALID_RESPONSE",
                "The external meal information service returned invalid data.",
                502,
            )
        return data

    @staticmethod
    def _extract_rows(payload: dict[str, Any], service_name: str) -> list[dict[str, Any]]:
        result = _find_result(payload)
        if result is None or not isinstance(result.get("CODE"), str):
            raise NeisClientError(
                "UPSTREAM_INVALID_RESPONSE",
                "The external meal information service returned invalid data.",
                502,
            )
        code = result["CODE"]
        if code == "INFO-200":
            return []
        if code != "INFO-000":
            raise NeisClientError(
                "UPSTREAM_ERROR",
                "The external meal information service could not process the request.",
                502,
            )

        service = payload.get(service_name)
        if not isinstance(service, list):
            raise NeisClientError(
                "UPSTREAM_INVALID_RESPONSE",
                "The external meal information service returned invalid data.",
                502,
            )

        rows: list[dict[str, Any]] = []
        for section in service:
            if not isinstance(section, dict):
                raise NeisClientError(
                    "UPSTREAM_INVALID_RESPONSE",
                    "The external meal information service returned invalid data.",
                    502,
                )
            if "row" not in section:
                continue
            section_rows = section["row"]
            if not isinstance(section_rows, list) or not all(
                isinstance(row, dict) for row in section_rows
            ):
                raise NeisClientError(
                    "UPSTREAM_INVALID_RESPONSE",
                    "The external meal information service returned invalid data.",
                    502,
                )
            rows.extend(section_rows)
        return rows


def _find_result(payload: dict[str, Any]) -> dict[str, Any] | None:
    top_result = payload.get("RESULT")
    if top_result is not None:
        return top_result if isinstance(top_result, dict) else None
    for value in payload.values():
        if not isinstance(value, list):
            continue
        for section in value:
            if not isinstance(section, dict):
                continue
            head = section.get("head")
            if not isinstance(head, list):
                continue
            for item in head:
                if isinstance(item, dict) and "RESULT" in item:
                    result = item["RESULT"]
                    return result if isinstance(result, dict) else None
    return None


_HTML_BREAK = re.compile(r"<\s*br\s*/?\s*>", flags=re.IGNORECASE)


def _normalise_menu(menu: str) -> str:
    """Retain menu text while presenting NEIS HTML line breaks as plain newlines."""

    return html.unescape(_HTML_BREAK.sub("\n", menu)).replace("\r\n", "\n").strip()
