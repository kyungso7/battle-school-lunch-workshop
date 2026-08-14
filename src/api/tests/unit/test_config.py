import pytest
from pydantic import ValidationError

from app.config import Settings


@pytest.mark.unit
def test_settings_parse_comma_separated_cors_origins() -> None:
    settings = Settings(
        CORS_ORIGINS="http://localhost:5173, https://lunch.example.com",
        NEIS_API_KEY="not-a-real-key",
    )

    assert settings.cors_origins == [
        "http://localhost:5173",
        "https://lunch.example.com",
    ]
    assert "not-a-real-key" not in repr(settings)


@pytest.mark.unit
def test_settings_parse_cors_origins_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173,https://lunch.example.com")

    assert Settings().cors_origins == [
        "http://localhost:5173",
        "https://lunch.example.com",
    ]


@pytest.mark.unit
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("NEIS_BASE_URL", "http://open.neis.go.kr/hub"),
        ("CORS_ORIGINS", "*"),
        ("CORS_ORIGINS", "https://example.com/path"),
    ],
)
def test_settings_reject_unsafe_network_configuration(field: str, value: str) -> None:
    with pytest.raises(ValidationError):
        Settings(**{field: value})
