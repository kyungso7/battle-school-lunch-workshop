"""FastAPI application factory and common error handling."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator
from uuid import uuid4

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings
from app.main_types import RequestInputError
from app.neis_client import NeisClient, NeisClientError
from app.routers import health, meals, schools
from app.schemas import ErrorResponse


def _error_response(
    request: Request, status_code: int, code: str, message: str, field: str | None = None
) -> JSONResponse:
    payload = ErrorResponse(
        code=code,
        message=message,
        field=field,
        request_id=getattr(request.state, "request_id", str(uuid4())),
    )
    return JSONResponse(
        status_code=status_code,
        content=payload.model_dump(by_alias=True, exclude_none=True),
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with httpx.AsyncClient(timeout=settings.neis_timeout_seconds) as http_client:
            app.state.neis_client = NeisClient(http_client, settings)
            yield

    app = FastAPI(title="School Lunch API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Accept", "Content-Type"],
    )

    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request.state.request_id = str(uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @app.exception_handler(RequestInputError)
    async def request_input_error_handler(
        request: Request, exc: RequestInputError
    ) -> JSONResponse:
        return _error_response(
            request, 422, "VALIDATION_ERROR", exc.message, field=exc.field
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = exc.errors()
        field = str(errors[0]["loc"][-1]) if errors else None
        return _error_response(
            request,
            422,
            "VALIDATION_ERROR",
            "Request validation failed.",
            field=field,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return _error_response(request, exc.status_code, "HTTP_ERROR", "Request failed.")

    @app.exception_handler(NeisClientError)
    async def neis_error_handler(request: Request, exc: NeisClientError) -> JSONResponse:
        return _error_response(request, exc.status_code, exc.code, exc.message)

    @app.exception_handler(Exception)
    async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
        return _error_response(
            request, 500, "INTERNAL_ERROR", "An unexpected server error occurred."
        )

    app.include_router(health.router)
    app.include_router(schools.router)
    app.include_router(meals.router)
    return app


app = create_app()
