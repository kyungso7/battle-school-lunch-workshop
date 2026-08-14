import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getLunchMeals, searchSchools } from "./lib/api";
import type { Meal, School } from "./lib/api";

type Step = "school-search" | "date-selection" | "meal-results";

interface MealCriteria {
  officeCode: string;
  schoolCode: string;
  from: string;
  to: string;
}

function toLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return toLocalDate(date);
}

function inclusiveDayCount(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return (
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000 +
    1
  );
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function StatusMessage({
  tone,
  children,
  action,
}: {
  tone: "error" | "empty";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`state-message state-message--${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <p>{children}</p>
      {action}
    </div>
  );
}

function SchoolDetails({ school }: { school: School }) {
  const identification = [school.schoolType, school.location].filter(Boolean).join(" · ");
  return (
    <span className="school-details">
      {identification && <span>{identification}</span>}
      {school.address && <span>{school.address}</span>}
    </span>
  );
}

function MealCard({ meal }: { meal: Meal }) {
  return (
    <article className="meal-card">
      <header className="meal-card__header">
        <time dateTime={meal.date}>{formatDate(meal.date)}</time>
        <span>{meal.mealType}</span>
      </header>
      <p className="meal-card__menu">{meal.menu}</p>
      {(meal.calories || meal.nutrition || meal.origin) && (
        <dl className="meal-card__details">
          {meal.calories && (
            <>
              <dt>열량</dt>
              <dd>{meal.calories}</dd>
            </>
          )}
          {meal.nutrition && (
            <>
              <dt>영양 정보</dt>
              <dd>{meal.nutrition}</dd>
            </>
          )}
          {meal.origin && (
            <>
              <dt>원산지</dt>
              <dd>{meal.origin}</dd>
            </>
          )}
        </dl>
      )}
    </article>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const defaults = useMemo(() => {
    const today = toLocalDate(new Date());
    return { from: today, to: addCalendarDays(today, 6) };
  }, []);
  const [step, setStep] = useState<Step>("school-search");
  const [schoolInput, setSchoolInput] = useState("");
  const [submittedSchoolQuery, setSubmittedSchoolQuery] = useState<string | null>(null);
  const [schoolInputError, setSchoolInputError] = useState("");
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [dateError, setDateError] = useState("");
  const [mealCriteria, setMealCriteria] = useState<MealCriteria | null>(null);

  const schoolsQuery = useQuery({
    queryKey: ["schools", submittedSchoolQuery],
    queryFn: ({ signal }) => searchSchools(submittedSchoolQuery!, signal),
    enabled: submittedSchoolQuery !== null,
  });

  const mealsQuery = useQuery({
    queryKey: ["meals", mealCriteria],
    queryFn: ({ signal }) => getLunchMeals(mealCriteria!, signal),
    enabled: mealCriteria !== null,
  });

  function submitSchoolSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = schoolInput.trim();
    if (!query) {
      setSchoolInputError("학교명을 입력해 주세요.");
      setSubmittedSchoolQuery(null);
      return;
    }
    setSchoolInputError("");
    setSubmittedSchoolQuery(query);
  }

  function selectSchool(school: School) {
    const changed =
      selectedSchool?.officeCode !== school.officeCode ||
      selectedSchool?.schoolCode !== school.schoolCode;
    setSelectedSchool(school);
    if (changed) {
      setMealCriteria(null);
      queryClient.removeQueries({ queryKey: ["meals"] });
    }
    setStep("date-selection");
  }

  function validateDates(): string {
    if (!fromDate || !toDate) return "시작일과 종료일을 모두 선택해 주세요.";
    if (fromDate > toDate) return "종료일은 시작일보다 빠를 수 없습니다.";
    if (inclusiveDayCount(fromDate, toDate) > 31) return "급식 조회 기간은 최대 31일까지 가능합니다.";
    return "";
  }

  function submitMeals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchool) {
      setDateError("먼저 조회할 학교를 선택해 주세요.");
      setStep("school-search");
      return;
    }
    const validationMessage = validateDates();
    if (validationMessage) {
      setDateError(validationMessage);
      return;
    }
    setDateError("");
    setMealCriteria({
      officeCode: selectedSchool.officeCode,
      schoolCode: selectedSchool.schoolCode,
      from: fromDate,
      to: toDate,
    });
    setStep("meal-results");
  }

  function changeDate(value: string, field: "from" | "to") {
    if (field === "from") setFromDate(value);
    else setToDate(value);
    setDateError("");
    setMealCriteria(null);
  }

  function changeSchool() {
    setMealCriteria(null);
    setSubmittedSchoolQuery(null);
    setSchoolInputError("");
    setStep("school-search");
  }

  function changeDates() {
    setMealCriteria(null);
    setStep("date-selection");
  }

  const isSchoolLoading = schoolsQuery.isFetching;
  const isMealLoading = mealsQuery.isFetching;

  return (
    <main className="app-shell">
      <header className="masthead">
        <a className="brand" href="/" aria-label="급식 배틀 처음으로">
          <span className="brand__mark" aria-hidden="true">
            🍚
          </span>
          <span>급식 배틀</span>
        </a>
        <p>오늘의 중식, 한 번에 찾기</p>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <div>
          <h1 id="page-title">우리 학교<br />점심은 뭐지?</h1>
          <p>학교를 고르고 날짜를 선택하면, 중식 메뉴를 날짜별로 바로 보여드려요.</p>
        </div>
        <ol className="steps" aria-label="급식 조회 단계">
          {[
            ["school-search", "학교 찾기"],
            ["date-selection", "날짜 고르기"],
            ["meal-results", "중식 확인"],
          ].map(([stepName, label], index) => (
            <li
              className={step === stepName ? "steps__item steps__item--current" : "steps__item"}
              key={stepName}
              aria-current={step === stepName ? "step" : undefined}
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </section>

      <section className="workflow" aria-label="급식 조회">
        {step === "school-search" && (
          <section className="panel panel--search" aria-labelledby="school-search-title">
            <div className="panel__heading">
              <h2 id="school-search-title">학교를 찾아볼까요?</h2>
              <p>학교 이름의 일부만 입력해도 됩니다.</p>
            </div>
            <form className="search-form" onSubmit={submitSchoolSearch} noValidate>
              <label htmlFor="school-query">학교명</label>
              <div className="search-form__row">
                <input
                  id="school-query"
                  name="school-query"
                  value={schoolInput}
                  onChange={(event) => {
                    setSchoolInput(event.target.value);
                    if (schoolInputError) setSchoolInputError("");
                  }}
                  aria-describedby={schoolInputError ? "school-query-error" : undefined}
                  aria-invalid={Boolean(schoolInputError)}
                  autoComplete="off"
                  placeholder="예: 한빛초, 서울고"
                  disabled={isSchoolLoading}
                />
                <button className="button button--primary" type="submit" disabled={isSchoolLoading}>
                  {isSchoolLoading ? "찾는 중…" : "학교 검색"}
                </button>
              </div>
              {schoolInputError && (
                <p id="school-query-error" className="field-error" role="alert">
                  {schoolInputError}
                </p>
              )}
            </form>

            {isSchoolLoading && (
              <div className="loading-line" role="status" aria-live="polite">
                <span aria-hidden="true" />
                학교 목록을 불러오고 있어요.
              </div>
            )}
            {schoolsQuery.isError && !isSchoolLoading && (
              <StatusMessage
                tone="error"
                action={
                  <button className="button button--quiet" type="button" onClick={() => schoolsQuery.refetch()}>
                    다시 시도
                  </button>
                }
              >
                {errorMessage(schoolsQuery.error, "학교 검색 중 문제가 발생했습니다.")}
              </StatusMessage>
            )}
            {schoolsQuery.isSuccess && schoolsQuery.data.length === 0 && (
              <StatusMessage tone="empty">
                <strong>검색 결과가 없어요.</strong> 학교명이나 지역을 바꿔 다시 검색해 주세요.
              </StatusMessage>
            )}
            {schoolsQuery.isSuccess && schoolsQuery.data.length > 0 && (
              <div className="school-results" aria-live="polite">
                <p className="result-count">
                  <strong>{schoolsQuery.data.length}곳</strong>을 찾았어요. 하나를 선택해 주세요.
                </p>
                <ul>
                  {schoolsQuery.data.map((school) => {
                    const isSelected =
                      selectedSchool?.officeCode === school.officeCode &&
                      selectedSchool.schoolCode === school.schoolCode;
                    return (
                      <li key={`${school.officeCode}-${school.schoolCode}`}>
                        <button
                          className={isSelected ? "school-option school-option--selected" : "school-option"}
                          type="button"
                          onClick={() => selectSchool(school)}
                          aria-pressed={isSelected}
                        >
                          <span className="school-option__name">{school.name}</span>
                          <SchoolDetails school={school} />
                          <span className="school-option__select">{isSelected ? "선택됨" : "선택"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        )}

        {step === "date-selection" && selectedSchool && (
          <section className="panel panel--date" aria-labelledby="date-selection-title">
            <div className="selection-summary">
              <div>
                <span>선택한 학교</span>
                <strong>{selectedSchool.name}</strong>
                <SchoolDetails school={selectedSchool} />
              </div>
              <button className="text-button" type="button" onClick={changeSchool}>
                학교 바꾸기
              </button>
            </div>
            <div className="panel__heading">
              <h2 id="date-selection-title">언제 먹는 급식인가요?</h2>
              <p>시작일과 종료일을 포함해 최대 31일까지 조회할 수 있어요.</p>
            </div>
            <form className="date-form" onSubmit={submitMeals} noValidate>
              <div className="date-form__fields">
                <div>
                  <label htmlFor="from-date">시작일</label>
                  <input
                    id="from-date"
                    type="date"
                    value={fromDate}
                    onChange={(event) => changeDate(event.target.value, "from")}
                    aria-describedby={dateError ? "date-error" : undefined}
                    aria-invalid={Boolean(dateError)}
                    disabled={isMealLoading}
                  />
                </div>
                <span className="date-form__divider" aria-hidden="true">—</span>
                <div>
                  <label htmlFor="to-date">종료일</label>
                  <input
                    id="to-date"
                    type="date"
                    value={toDate}
                    onChange={(event) => changeDate(event.target.value, "to")}
                    aria-describedby={dateError ? "date-error" : undefined}
                    aria-invalid={Boolean(dateError)}
                    disabled={isMealLoading}
                  />
                </div>
              </div>
              {dateError && (
                <p id="date-error" className="field-error" role="alert">
                  {dateError}
                </p>
              )}
              <button className="button button--primary button--wide" type="submit" disabled={isMealLoading}>
                중식 메뉴 보기
              </button>
            </form>
          </section>
        )}

        {step === "meal-results" && selectedSchool && mealCriteria && (
          <section className="panel panel--results" aria-labelledby="meal-results-title">
            <div className="result-summary">
              <div>
                <span>{selectedSchool.name}</span>
                <strong>
                  {formatDate(mealCriteria.from)} {mealCriteria.from !== mealCriteria.to && `— ${formatDate(mealCriteria.to)}`}
                </strong>
              </div>
              <div className="result-summary__actions">
                <button className="text-button" type="button" onClick={changeDates}>
                  날짜 바꾸기
                </button>
                <button className="text-button" type="button" onClick={changeSchool}>
                  학교 바꾸기
                </button>
              </div>
            </div>
            <div className="panel__heading">
              <h2 id="meal-results-title">이번 중식 메뉴예요</h2>
              <p>알레르기 표기를 포함한 학교 급식 원문을 그대로 보여드려요.</p>
            </div>
            {isMealLoading && (
              <div className="loading-stage" role="status" aria-live="polite">
                <span className="loading-stage__dish" aria-hidden="true">🍽️</span>
                <p>중식 메뉴를 차리고 있어요…</p>
              </div>
            )}
            {mealsQuery.isError && !isMealLoading && (
              <StatusMessage
                tone="error"
                action={
                  <button className="button button--quiet" type="button" onClick={() => mealsQuery.refetch()}>
                    다시 시도
                  </button>
                }
              >
                {errorMessage(mealsQuery.error, "급식 정보를 불러오지 못했습니다.")}
              </StatusMessage>
            )}
            {mealsQuery.isSuccess && mealsQuery.data.length === 0 && (
              <StatusMessage tone="empty">
                <strong>등록된 중식이 없어요.</strong> 다른 날짜를 선택해 다시 확인해 주세요.
              </StatusMessage>
            )}
            {mealsQuery.isSuccess && mealsQuery.data.length > 0 && (
              <div className="meal-list" aria-live="polite">
                {mealsQuery.data.map((meal) => (
                  <MealCard key={`${meal.date}-${meal.mealType}`} meal={meal} />
                ))}
              </div>
            )}
          </section>
        )}
      </section>

      <footer>
        <p>급식 정보는 학교가 제공하는 NEIS 데이터를 바탕으로 안내합니다.</p>
      </footer>
    </main>
  );
}
