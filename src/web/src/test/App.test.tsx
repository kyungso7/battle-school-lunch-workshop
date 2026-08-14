import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import App from "../App";
import { server, schools } from "./server";

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

async function selectSchool(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("학교명"), "한빛");
  await user.click(screen.getByRole("button", { name: "학교 검색" }));
  await screen.findByRole("button", { name: /한빛초등학교/ });
  await user.click(screen.getByRole("button", { name: /한빛초등학교/ }));
  await screen.findByRole("heading", { name: "언제 먹는 급식인가요?" });
}

describe("급식 배틀 사용자 흐름", () => {
  it("부분 학교명을 검색하고 학교를 선택한다", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("학교명"), "한빛");
    await user.click(screen.getByRole("button", { name: "학교 검색" }));

    expect(await screen.findByText("한빛초등학교")).toBeInTheDocument();
    expect(screen.getByText("서울특별시 강남구 한빛로 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /한빛초등학교/ }));
    expect(await screen.findByText("선택한 학교")).toBeInTheDocument();
  });

  it("빈 검색어, 검색 결과 없음, 검색 오류를 구분해 안내한다", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "학교 검색" }));
    expect(screen.getByRole("alert")).toHaveTextContent("학교명을 입력해 주세요.");

    server.use(http.get("http://localhost/api/schools", () => HttpResponse.json([])));
    await user.type(screen.getByLabelText("학교명"), "없는학교");
    await user.click(screen.getByRole("button", { name: "학교 검색" }));
    expect(await screen.findByText("검색 결과가 없어요.")).toBeInTheDocument();

    server.use(http.get("http://localhost/api/schools", () => HttpResponse.json({ message: "잠시 후 다시 시도해 주세요." }, { status: 502 })));
    await user.clear(screen.getByLabelText("학교명"));
    await user.type(screen.getByLabelText("학교명"), "오류학교");
    await user.click(screen.getByRole("button", { name: "학교 검색" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요.");
  });

  it("날짜 누락, 역전, 31일 초과를 요청 없이 검증한다", async () => {
    const user = userEvent.setup();
    renderApp();
    await selectSchool(user);

    await user.clear(screen.getByLabelText("시작일"));
    await user.click(screen.getByRole("button", { name: "중식 메뉴 보기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("시작일과 종료일을 모두 선택해 주세요.");

    await user.type(screen.getByLabelText("시작일"), "2026-08-20");
    await user.clear(screen.getByLabelText("종료일"));
    await user.type(screen.getByLabelText("종료일"), "2026-08-19");
    await user.click(screen.getByRole("button", { name: "중식 메뉴 보기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("종료일은 시작일보다 빠를 수 없습니다.");

    await user.clear(screen.getByLabelText("시작일"));
    await user.type(screen.getByLabelText("시작일"), "2026-08-01");
    await user.clear(screen.getByLabelText("종료일"));
    await user.type(screen.getByLabelText("종료일"), "2026-09-01");
    await user.click(screen.getByRole("button", { name: "중식 메뉴 보기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("최대 31일까지");
  });

  it("중식 로딩과 날짜별 메뉴를 표시한다", async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("http://localhost/api/meals", async () => {
        await delayed;
        return HttpResponse.json([
          { date: "2026-08-17", mealType: "중식", menu: "현미밥\n닭갈비(5.6.15)" },
        ]);
      }),
    );
    renderApp();
    await selectSchool(user);
    await user.click(screen.getByRole("button", { name: "중식 메뉴 보기" }));
    expect(await screen.findByText("중식 메뉴를 차리고 있어요…")).toBeInTheDocument();
    release?.();
    expect(await screen.findByText(/닭갈비/)).toBeInTheDocument();
    expect(screen.getByText("중식")).toBeInTheDocument();
  });

  it("급식 없음과 오류 재시도를 처리한다", async () => {
    const user = userEvent.setup();
    server.use(http.get("http://localhost/api/meals", () => HttpResponse.json([])));
    renderApp();
    await selectSchool(user);
    await user.click(screen.getByRole("button", { name: "중식 메뉴 보기" }));
    expect(await screen.findByText("등록된 중식이 없어요.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "날짜 바꾸기" }));
    server.use(
      http.get("http://localhost/api/meals", () =>
        HttpResponse.json({ message: "급식 서비스가 일시적으로 지연되고 있어요." }, { status: 504 }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "중식 메뉴 보기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("일시적으로 지연");

    server.use(http.get("http://localhost/api/meals", () => HttpResponse.json([])));
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.getByText("등록된 중식이 없어요.")).toBeInTheDocument());
  });

  it("학교를 바꾸면 이전 급식 결과를 지운다", async () => {
    const user = userEvent.setup();
    renderApp();
    await selectSchool(user);
    await user.click(screen.getByRole("button", { name: "중식 메뉴 보기" }));
    expect(await screen.findByText(/닭갈비/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "학교 바꾸기" }));
    await user.clear(screen.getByLabelText("학교명"));
    await user.type(screen.getByLabelText("학교명"), "한빛");
    await user.click(screen.getByRole("button", { name: "학교 검색" }));
    await screen.findByRole("button", { name: /한빛중학교/ });
    await user.click(screen.getByRole("button", { name: /한빛중학교/ }));

    expect(screen.queryByText(/닭갈비/)).not.toBeInTheDocument();
    expect(screen.getByText("한빛중학교")).toBeInTheDocument();
    expect(schools).toHaveLength(2);
  });
});
