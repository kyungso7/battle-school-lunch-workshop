"""Application settings loaded exclusively by the backend process."""

from __future__ import annotations

import json
from typing import Annotated, Any
from urllib.parse import urlparse

from pydantic import BeforeValidator, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _parse_origins(value: Any) -> list[str]:
    if isinstance(value, list):
        return value
    if not isinstance(value, str):
        raise ValueError("must be a comma-separated list or JSON list")
    text = value.strip()
    if text.startswith("["):
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            raise ValueError("must be a JSON list")
        return parsed
    return [origin.strip() for origin in text.split(",") if origin.strip()]


CorsOrigins = Annotated[list[str], NoDecode, BeforeValidator(_parse_origins)]


class Settings(BaseSettings):
    """Runtime settings with secure defaults suitable for local tests."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    neis_api_key: SecretStr = Field(
        default=SecretStr("test-key"),
        validation_alias="NEIS_API_KEY",
        repr=False,
    )
    neis_base_url: str = Field(
        default="https://open.neis.go.kr/hub",
        validation_alias="NEIS_BASE_URL",
    )
    neis_timeout_seconds: float = Field(
        default=10.0,
        gt=0,
        le=60,
        validation_alias="NEIS_TIMEOUT_SECONDS",
    )
    cors_origins: CorsOrigins = Field(
        default_factory=lambda: ["http://localhost:5173"],
        validation_alias="CORS_ORIGINS",
    )

    @field_validator("neis_base_url")
    @classmethod
    def require_https_base_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("must be an HTTPS URL")
        return value.rstrip("/")

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, origins: list[str]) -> list[str]:
        if not origins:
            raise ValueError("must contain at least one origin")
        for origin in origins:
            parsed = urlparse(origin)
            if (
                origin == "*"
                or parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.path not in {"", "/"}
                or parsed.params
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError("must contain complete HTTP(S) origins, never '*'")
        return [origin.rstrip("/") for origin in origins]
