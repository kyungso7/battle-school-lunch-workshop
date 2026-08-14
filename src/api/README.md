# School Lunch API

FastAPI service that keeps the NEIS API key on the server and exposes the
application's `/api` contract.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `NEIS_API_KEY` | `test-key` | NEIS key supplied only to the backend runtime. |
| `NEIS_BASE_URL` | `https://open.neis.go.kr/hub` | HTTPS NEIS base URL. |
| `NEIS_TIMEOUT_SECONDS` | `10` | Upstream request timeout in seconds. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated or JSON HTTP(S) origins. |

Set a real `NEIS_API_KEY` before using the service against NEIS. The default
only permits isolated tests and must not be treated as a usable credential.

## Run and test

```bash
uv sync --all-groups
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
uv run pytest
```

The service returns a `requestId` in every error payload and as
`X-Request-ID`. It never returns the NEIS key or raw upstream errors.
