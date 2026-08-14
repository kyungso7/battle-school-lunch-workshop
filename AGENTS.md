# AGENTS.md

이 문서는 AI 코딩 에이전트가 이 저장소에서 작업할 때 따라야 할 프로젝트 규칙,
검증 명령과 주의사항을 정의합니다. 제품 요구사항은 `PRD.md`, 기술 결정은 `TRD.md`,
사람을 위한 실행 방법은 각 패키지의 `README.md`를 우선 참고합니다.

## 프로젝트 개요

이 프로젝트는 NEIS 오픈 API의 학교기본정보와 급식식단정보를 사용하는 풀스택 급식
조회 애플리케이션입니다.

- 프런트엔드는 React 19, TypeScript, Vite, Tailwind CSS v4로 구현합니다.
- 백엔드는 Python 3.12+, FastAPI, Pydantic, 비동기 `httpx`로 구현합니다.
- 급식 조회는 중식(`MMEAL_SC_CODE=2`)을 기준으로 하며 날짜 범위는 최대 31일입니다.
- 브라우저는 NEIS API를 직접 호출하지 않고 백엔드의 `/api/*`만 호출합니다.
- 개발 환경에서는 Vite가 `/api`를 `http://localhost:8000`으로 프록시하고,
  컨테이너 환경에서는 nginx가 동일 오리진의 `/api`를 API 컨테이너로 프록시합니다.

## 디렉터리 구조

```text
/
├── .github/                 이슈·PR 템플릿, CODEOWNERS, CI
├── .devcontainer/           Codespaces 개발 환경
├── AGENTS.md                AI 코딩 에이전트 작업 지침
├── PRD.md                   제품 요구사항
├── TRD.md                   기술 요구사항과 아키텍처 결정
├── compose.yaml             API와 Web 컨테이너 오케스트레이션
├── .env.example             환경 변수 예시
├── openapi.json             현재 저장소의 NEIS API 계약
├── data/                    원본 NEIS 명세와 계약 자료
└── src/
    ├── api/                 FastAPI 백엔드
    │   ├── app/             앱 설정, 스키마, NEIS 클라이언트, 라우터
    │   ├── tests/unit/      순수 단위 테스트
    │   ├── tests/integration/ FastAPI 통합 테스트
    │   ├── pyproject.toml
    │   └── uv.lock
    ├── web/                 React·TypeScript 프런트엔드
    │   ├── src/pages/       라우팅 페이지
    │   ├── src/components/  UI 컴포넌트
    │   ├── src/lib/api.ts   백엔드 API 호출 래퍼
    │   └── src/test/        MSW와 통합 테스트 인프라
    ├── e2e/                 Playwright E2E 테스트
    └── openapi.json         앱 구현 시 사용하는 NEIS API 계약 사본
```

### 백엔드 구조

- `src/api/app/main.py`: FastAPI 앱 팩토리, CORS, lifespan, 라우터 등록
- `src/api/app/config.py`: `pydantic-settings` 기반 환경 설정
- `src/api/app/neis_client.py`: NEIS 전용 비동기 HTTP 클라이언트
- `src/api/app/schemas.py`: 요청·응답 Pydantic 모델
- `src/api/app/routers/`: `/api/health`, `/api/schools`, `/api/meals` 라우터

### 프런트엔드 구조

- `src/web/src/pages/`: 학교 검색, 날짜 선택, 급식 결과 페이지
- `src/web/src/components/ui/`: 재사용 가능한 프레젠테이션 컴포넌트
- `src/web/src/lib/api.ts`: 모든 `/api/*` 요청을 캡슐화하는 유일한 호출 경계
- `src/web/src/test/`: Testing Library 헬퍼, MSW 핸들러, 통합 테스트

## 런타임과 도구

| 영역 | 런타임·패키지 관리자 | 주요 도구 |
| --- | --- | --- |
| 백엔드 | Python 3.12+, `uv` | FastAPI, Uvicorn, Pydantic, httpx, pytest, respx |
| 프런트엔드 | Node.js 22+ (24 LTS 권장), npm 10+ | React 19, TypeScript, Vite, ESLint, Vitest, RTL, MSW |
| E2E | Node.js 22+ (24 LTS 권장), npm 10+ | Playwright, Chromium |
| 컨테이너 | Docker 24+와 Compose 플러그인 | nginx, Docker Compose |

## 설치, 실행 및 검증 명령

명령은 각 제목에 표시된 작업 디렉터리에서 실행합니다. CI나 재현 가능한 검증에서는
`npm install` 대신 `npm ci`, `uv sync` 대신 `uv sync --all-groups --frozen`을
사용합니다.

### 백엔드 (`src/api/`)

```bash
uv sync
uv sync --all-groups
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
uv run pytest -m unit
uv run pytest -m integration
uv run pytest --cov=app
```

Python 전용 포매터나 린터는 현재 구성되어 있지 않습니다. 임의의 도구를 새로 도입하지
말고 기존 스타일을 유지하며, 최소 검증으로 `uv run pytest`를 실행합니다.

### 프런트엔드 (`src/web/`)

```bash
npm install
npm run dev
npm run lint
npm test
npm run test:coverage
npm run build
npm run preview
```

- `npm run lint`는 ESLint 검사입니다.
- `npm run build`는 `tsc -b` 타입 검사 후 Vite 프로덕션 빌드를 수행합니다.
- 포맷은 루트 `.prettierrc`를 따릅니다. 저장소에 Prettier 스크립트가 추가된 경우
  `npm run format`과 `npm run format:check`를 사용하고, 스크립트가 없다면 존재하지
  않는 명령을 문서화하거나 실행하지 않습니다.

### E2E (`src/e2e/`)

```bash
npm install
npx playwright install chromium
npm test
npm run test:headed
npm run test:ui
npm run report
```

`npm test`의 `pretest`는 `src/web`을 먼저 빌드합니다.

### Docker Compose (저장소 루트)

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --no-color
docker compose down
```

실행 전 루트 `.env`에 `NEIS_API_KEY`를 설정합니다. 외부에는 Web 포트
`${WEB_PORT:-8080}`만 노출하고 API는 Compose 네트워크 내부에 유지합니다.

## 구현 규칙

### API와 데이터 계약

- `openapi.json`과 앱에 포함된 `src/openapi.json`을 NEIS API 계약의 단일 원본으로
  취급합니다. `data/openapi.json`이 존재하는 브랜치에서는 해당 파일이 우선 계약이며,
  사본 간 차이가 생기지 않도록 함께 검증합니다.
- OpenAPI의 필드명, 필수 여부, 날짜 형식과 응답 구조를 임의로 변경하지 않습니다.
- 백엔드 요청·응답은 `schemas.py`의 타입이 지정된 Pydantic 모델로 정의합니다.
- 외부 NEIS 호출은 `neis_client.py`를 통해서만 수행하고 타임아웃과 NEIS 오류를
  명시적인 API 오류로 변환합니다.
- 설정과 비밀 정보는 `config.py`의 `pydantic-settings`를 통해 주입합니다.

### 프런트엔드

- 컴포넌트나 페이지에서 NEIS API 또는 `fetch`를 직접 호출하지 않습니다.
- 모든 서버 요청은 `src/web/src/lib/api.ts`를 거치고 서버 상태는
  `@tanstack/react-query`로 관리합니다.
- API 응답 타입은 백엔드/OpenAPI 계약과 일치시킵니다. 계약 불일치를 타입 단언이나
  `any`로 숨기지 않습니다.

### 의존성과 생성 파일

- Python 의존성은 `src/api/`에서 `uv add`로 변경하고 `uv.lock`을 함께 갱신합니다.
- 프런트엔드와 E2E 의존성은 해당 디렉터리에서 npm으로 변경하고
  `package-lock.json`을 함께 갱신합니다.
- 락 파일, `dist/`, `coverage/`, `playwright-report/` 같은 생성 파일을 직접
  편집하거나 커밋하지 않습니다.
- Dockerfile과 `compose.yaml`의 non-root 사용자, `cap_drop: ALL`,
  `no-new-privileges`, read-only 루트 파일시스템을 약화시키지 않습니다.

## 테스트 원칙

| 계층 | 위치 | 실행 명령 | 외부 경계 |
| --- | --- | --- | --- |
| API 단위 | `src/api/tests/unit/` | `uv run pytest -m unit` | I/O 없음 |
| API 통합 | `src/api/tests/integration/` | `uv run pytest -m integration` | NEIS HTTP를 respx로 모킹 |
| Web 단위·통합 | `src/web/src/**/*.test.*`, `src/web/src/test/integration/` | `npm test` | `/api/*`를 MSW로 모킹 |
| E2E | `src/e2e/tests/` | `npm test` | `/api/*`를 `page.route`로 모킹 |

- 테스트는 실제 NEIS 서비스나 실제 API 키에 의존하지 않습니다.
- 버그 수정은 가능하면 실패를 재현하는 테스트를 먼저 추가합니다.
- 백엔드의 새 pytest 마커는 `pyproject.toml`에 등록합니다. `--strict-markers`를
  우회하지 않습니다.
- 사용자 흐름과 서버 상태 연동은 개별 구현 세부사항보다 통합 테스트로 검증합니다.
- 단순 프레젠테이션 컴포넌트나 한 줄 유틸에는 의미 없는 테스트를 추가하지 않습니다.
  폼 검증, 상태 전이, 오류 처리 등 실제 동작을 테스트합니다.
- E2E는 페이지 객체와 공용 fixture를 재사용하고 안정적인 role/label 기반 locator를
  우선합니다.

## 비밀 정보와 보안

- `.env`, API 키, 토큰, 자격 증명을 커밋하거나 로그·오류·테스트 fixture에 넣지
  않습니다. `.env.example`에는 이름과 안전한 예시만 둡니다.
- `NEIS_API_KEY`는 백엔드 런타임에만 환경 변수로 주입하고 브라우저 번들 또는
  `VITE_*` 변수로 노출하지 않습니다.
- CORS 허용 목록은 `CORS_ORIGINS`로 제한합니다. 편의를 위해 와일드카드로 넓히지
  않습니다.
- 운영 nginx 프록시의 TLS SNI와 Host 전달 설정을 변경할 때 업스트림 라우팅을
  반드시 검증합니다.

## Git 커밋과 Pull Request

- 작업 전 `git branch --show-current`와 `git status --short`로 브랜치와 기존 변경을
  확인합니다.
- 서로 다른 작업을 한 커밋에 섞지 않고, 관련된 코드·테스트·문서를 함께 커밋합니다.
- 사용자 변경을 되돌리거나 생성 파일과 비밀 정보를 커밋하지 않습니다.
- **모든 PR은 반드시 `.github/PULL_REQUEST_TEMPLATE.md`를 활용해 작성합니다.**
  템플릿의 제목과 체크리스트를 삭제하거나 생략하지 말고, 관련 이슈와 실제 실행한
  검증 명령을 기록합니다.
- PR 작성 전 `main`과 현재 브랜치 사이의 커밋과 diff를 확인하여 변경 내용을 빠짐없이
  요약합니다.
