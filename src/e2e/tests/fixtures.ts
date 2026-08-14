import { expect, test as base } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

export interface School {
  officeCode: string;
  schoolCode: string;
  name: string;
  schoolType?: string;
  location?: string;
  address?: string;
}

export interface Meal {
  date: string;
  mealType: string;
  menu: string;
  calories?: string;
  nutrition?: string;
  origin?: string;
}

interface MockResponse {
  status: number;
  body: unknown;
}

export const schools: School[] = [
  {
    officeCode: "B10",
    schoolCode: "7010010",
    name: "한빛초등학교",
    schoolType: "초등학교",
    location: "서울특별시",
    address: "서울특별시 강남구 한빛로 1",
  },
  {
    officeCode: "B10",
    schoolCode: "7010020",
    name: "한빛중학교",
    schoolType: "중학교",
    location: "서울특별시",
    address: "서울특별시 강남구 별빛로 2",
  },
];

const defaultMeals: Meal[] = [
  {
    date: "2026-08-17",
    mealType: "중식",
    menu: "현미밥\n된장국(5.6)\n닭갈비(5.6.15)",
    calories: "675.2 Kcal",
    nutrition: "탄수화물 80g",
    origin: "쌀: 국내산",
  },
  {
    date: "2026-08-18",
    mealType: "중식",
    menu: "보리밥\n미역국(5.6)\n제육볶음(5.6.10)",
  },
];

export class ApiMock {
  schoolResponse: MockResponse = { status: 200, body: schools };
  mealResponse: MockResponse = { status: 200, body: defaultMeals };
  readonly schoolRequests: URL[] = [];
  readonly mealRequests: URL[] = [];

  constructor(private readonly page: Page) {}

  async install() {
    await this.page.route("**/api/**", (route) => this.handle(route));
  }

  respondWithSchools(body: School[], status = 200) {
    this.schoolResponse = { status, body };
  }

  respondWithMeals(body: Meal[], status = 200) {
    this.mealResponse = { status, body };
  }

  respondWithMealError(message: string, status = 502) {
    this.mealResponse = {
      status,
      body: { code: "UPSTREAM_ERROR", message, requestId: "e2e-request" },
    };
  }

  private async handle(route: Route) {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/schools") {
      this.schoolRequests.push(url);
      await route.fulfill({
        status: this.schoolResponse.status,
        contentType: "application/json",
        body: JSON.stringify(this.schoolResponse.body),
      });
      return;
    }
    if (url.pathname === "/api/meals") {
      this.mealRequests.push(url);
      await route.fulfill({
        status: this.mealResponse.status,
        contentType: "application/json",
        body: JSON.stringify(this.mealResponse.body),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unexpected API request" }),
    });
  }
}

export class LunchPage {
  constructor(private readonly page: Page) {}

  async open() {
    await this.page.goto("/");
    await expect(this.page.getByRole("heading", { name: /우리 학교/ })).toBeVisible();
  }

  async searchForSchool(query: string) {
    await this.page.getByLabel("학교명").fill(query);
    await this.page.getByRole("button", { name: "학교 검색" }).click();
  }

  async selectSchool(name: string) {
    await this.page.getByRole("button", { name: new RegExp(name) }).click();
    await expect(this.page.getByRole("heading", { name: "언제 먹는 급식인가요?" })).toBeVisible();
  }

  async selectDateRange(from: string, to: string) {
    await this.page.getByLabel("시작일").fill(from);
    await this.page.getByLabel("종료일").fill(to);
  }

  async viewMeals() {
    await this.page.getByRole("button", { name: "중식 메뉴 보기" }).click();
  }
}

type LunchFixtures = {
  api: ApiMock;
  lunchPage: LunchPage;
};

export const test = base.extend<LunchFixtures>({
  api: async ({ page }, use) => {
    const api = new ApiMock(page);
    await api.install();
    await use(api);
  },
  lunchPage: async ({ page }, use) => {
    await use(new LunchPage(page));
  },
});

export { expect };
