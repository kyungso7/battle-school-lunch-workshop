# 급식 배틀 웹

React, TypeScript, Vite 기반의 학교 중식 조회 화면입니다. 브라우저는 같은 출처의
`/api`만 호출하며 NEIS API 키를 사용하거나 노출하지 않습니다.

## 실행

백엔드를 `http://localhost:8000`에서 실행한 뒤 다음을 실행합니다.

```bash
npm install
npm run dev
```

Vite 개발 서버는 `/api` 요청을 백엔드로 프록시합니다.

## 검증

```bash
npm run lint
npm test
npm run test:coverage
npm run build
```

## 컨테이너

`Dockerfile`은 정적 자산을 nginx로 제공하고 `/api`를 Compose 네트워크의
`api:8000`으로 프록시합니다. nginx 상태 확인 경로는 `GET /health`입니다.
