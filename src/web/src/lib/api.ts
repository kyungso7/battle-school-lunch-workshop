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

interface ErrorPayload {
  code?: string;
  message?: string;
  field?: string;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly field?: string;
  readonly requestId?: string;

  constructor(message: string, status = 0, payload: ErrorPayload = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload.code;
    this.field = payload.field;
    this.requestId = payload.requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asErrorPayload(value: unknown): ErrorPayload {
  if (!isRecord(value)) return {};
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    field: typeof value.field === "string" ? value.field : undefined,
    requestId: typeof value.requestId === "string" ? value.requestId : undefined,
  };
}

function isSchool(value: unknown): value is School {
  return (
    isRecord(value) &&
    typeof value.officeCode === "string" &&
    typeof value.schoolCode === "string" &&
    typeof value.name === "string"
  );
}

function isMeal(value: unknown): value is Meal {
  return (
    isRecord(value) &&
    typeof value.date === "string" &&
    typeof value.mealType === "string" &&
    typeof value.menu === "string"
  );
}

async function getJson<T>(
  path: string,
  signal: AbortSignal | undefined,
  validate: (value: unknown) => value is T,
): Promise<T> {
  let response: Response;
  try {
    let compatibleSignal = signal;
    if (signal) {
      try {
        new Request("about:blank", { signal });
      } catch {
        compatibleSignal = undefined;
      }
    }
    response = await fetch(new URL(path, window.location.origin), {
      headers: { Accept: "application/json" },
      signal: compatibleSignal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    if (!response.ok) {
      throw new ApiError("서버에서 올바른 응답을 받지 못했습니다.", response.status);
    }
    throw new ApiError("서버 응답 형식이 올바르지 않습니다.", response.status);
  }

  if (!response.ok) {
    const payload = asErrorPayload(body);
    throw new ApiError(
      payload.message ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      response.status,
      payload,
    );
  }

  if (!validate(body)) {
    throw new ApiError("서버 응답 형식이 올바르지 않습니다.", response.status);
  }
  return body;
}

export function searchSchools(query: string, signal?: AbortSignal): Promise<School[]> {
  const params = new URLSearchParams({ query });
  return getJson(
    `/api/schools?${params.toString()}`,
    signal,
    (value): value is School[] => Array.isArray(value) && value.every(isSchool),
  );
}

export function getLunchMeals(
  criteria: { officeCode: string; schoolCode: string; from: string; to: string },
  signal?: AbortSignal,
): Promise<Meal[]> {
  const params = new URLSearchParams(criteria);
  return getJson(
    `/api/meals?${params.toString()}`,
    signal,
    (value): value is Meal[] => Array.isArray(value) && value.every(isMeal),
  );
}
