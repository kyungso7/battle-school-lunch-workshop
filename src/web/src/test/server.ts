import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const schools = [
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

export const server = setupServer(
  http.get("http://localhost/api/schools", () => HttpResponse.json(schools)),
  http.get("http://localhost/api/meals", () =>
    HttpResponse.json([
      {
        date: "2026-08-17",
        mealType: "중식",
        menu: "현미밥\n된장국(5.6)\n닭갈비(5.6.15)",
        calories: "675.2 Kcal",
        nutrition: "탄수화물 80g",
        origin: "쌀: 국내산",
      },
    ]),
  ),
);
