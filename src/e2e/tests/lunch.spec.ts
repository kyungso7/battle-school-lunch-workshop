import { expect, schools, test } from "./fixtures";
import type { LunchPage } from "./fixtures";

async function selectSchoolAndDates(
  lunchPage: LunchPage,
  schoolName = "한빛초등학교",
) {
  await lunchPage.open();
  await lunchPage.searchForSchool("한빛");
  await lunchPage.selectSchool(schoolName);
  await lunchPage.selectDateRange("2026-08-17", "2026-08-18");
}

test("searches by a partial school name and shows lunch grouped by date", async ({
  api,
  lunchPage,
  page,
}) => {
  await selectSchoolAndDates(lunchPage);
  await lunchPage.viewMeals();

  await expect(page.getByRole("heading", { name: "이번 중식 메뉴예요" })).toBeVisible();
  await expect(page.getByText("닭갈비(5.6.15)")).toBeVisible();
  await expect(page.getByText("제육볶음(5.6.10)")).toBeVisible();
  await expect(page.locator("time[datetime='2026-08-17']")).toBeVisible();
  await expect(page.locator("time[datetime='2026-08-18']")).toBeVisible();
  await expect(page.locator("article.meal-card")).toHaveCount(2);
  expect(api.schoolRequests).toHaveLength(1);
  expect(api.schoolRequests[0].searchParams.get("query")).toBe("한빛");
  expect(api.mealRequests).toHaveLength(1);
  expect(api.mealRequests[0].searchParams.get("officeCode")).toBe("B10");
  expect(api.mealRequests[0].searchParams.get("schoolCode")).toBe("7010010");
  expect(api.mealRequests[0].searchParams.get("from")).toBe("2026-08-17");
  expect(api.mealRequests[0].searchParams.get("to")).toBe("2026-08-18");
});

test("explains when a school search has no matches", async ({ api, lunchPage, page }) => {
  api.respondWithSchools([]);
  await lunchPage.open();
  await lunchPage.searchForSchool("없는학교");

  await expect(page.getByRole("status")).toContainText("검색 결과가 없어요.");
  expect(api.schoolRequests).toHaveLength(1);
});

test("validates an invalid date range before requesting meals", async ({ api, lunchPage, page }) => {
  await lunchPage.open();
  await lunchPage.searchForSchool("한빛");
  await lunchPage.selectSchool(schools[0].name);
  await lunchPage.selectDateRange("2026-08-20", "2026-08-19");
  await lunchPage.viewMeals();

  await expect(page.getByRole("alert")).toContainText("종료일은 시작일보다 빠를 수 없습니다.");
  expect(api.mealRequests).toHaveLength(0);
});

test("explains when the selected dates have no lunch meals", async ({ api, lunchPage, page }) => {
  api.respondWithMeals([]);
  await selectSchoolAndDates(lunchPage);
  await lunchPage.viewMeals();

  await expect(page.getByRole("status")).toContainText("등록된 중식이 없어요.");
});

test("shows a server error and retries the meal request", async ({ api, lunchPage, page }) => {
  api.respondWithMealError("급식 서비스가 일시적으로 지연되고 있어요.", 504);
  await selectSchoolAndDates(lunchPage);
  await lunchPage.viewMeals();

  await expect(page.getByRole("alert")).toContainText("일시적으로 지연");
  const requestsBeforeRetry = api.mealRequests.length;
  api.respondWithMeals([]);
  await page.getByRole("button", { name: "다시 시도" }).click();

  await expect(page.getByRole("status")).toContainText("등록된 중식이 없어요.");
  expect(api.mealRequests).toHaveLength(requestsBeforeRetry + 1);
});
