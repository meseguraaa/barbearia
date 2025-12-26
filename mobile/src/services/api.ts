import * as SecureStore from "expo-secure-store";

export const AUTH_TOKEN_KEY = "auth_token";
const AUTH_SESSION_KEY = "auth_session";

/**
 * Base URL do backend
 *
 * ✅ Regra: EXPO_PUBLIC_API_URL define o backend em DEV/PROD.
 * Em DEV, se não houver EXPO_PUBLIC_API_URL, usa localhost.
 */
const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (__DEV__ ? "http://localhost:3000" : "");

// Em produção, não aceitamos base vazia.
if (!API_URL) {
  throw new Error(
    "[api] EXPO_PUBLIC_API_URL é obrigatório em produção. Defina no .env do app.",
  );
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type HeadersMap = Record<string, string>;
type HeadersLike = HeadersMap | { headers?: HeadersMap };

type RequestOptions = {
  method?: HttpMethod;
  body?: any;
  headers?: HeadersLike;
};

function normalizeHeaders(input?: HeadersLike): HeadersMap {
  if (!input) return {};
  if (typeof (input as any).headers === "object") {
    return ((input as any).headers ?? {}) as HeadersMap;
  }
  return input as HeadersMap;
}

async function safeReadBody(res: Response) {
  try {
    return await res.json();
  } catch {
    try {
      const text = await res.text();
      return text ? { raw: text } : null;
    } catch {
      return null;
    }
  }
}

function pickToken(obj: any): string | null {
  const candidates = [
    obj?.appToken,
    obj?.token,
    obj?.accessToken,
    obj?.app_token,
    obj?.session?.appToken,
    obj?.session?.token,
    obj?.session?.accessToken,
    obj?.data?.appToken,
    obj?.data?.token,
    obj?.data?.accessToken,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function tryExtractTokenFromSession(sessionJson: string | null): string | null {
  if (!sessionJson) return null;
  try {
    const parsed = JSON.parse(sessionJson);
    const t = pickToken(parsed);
    return typeof t === "string" && t.length >= 10 ? t : null;
  } catch {
    return null;
  }
}

async function getAuthToken(): Promise<string | null> {
  // 1) fonte principal: auth_token
  const direct = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  if (direct && direct.trim()) return direct.trim();

  // 2) fallback: auth_session.*
  const sessionJson = await SecureStore.getItemAsync(AUTH_SESSION_KEY);
  const fromSession = tryExtractTokenFromSession(sessionJson);
  if (fromSession) {
    // “cura” pra próximas requests
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, fromSession);
    return fromSession;
  }

  return null;
}

function joinUrl(base: string, path: string) {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function request<T = any>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = await getAuthToken();
  const extraHeaders = normalizeHeaders(options.headers);

  const hasAuthHeader =
    typeof (extraHeaders as any)?.Authorization === "string" &&
    String((extraHeaders as any).Authorization).trim().length > 0;

  const res = await fetch(joinUrl(API_URL, path), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token && !hasAuthHeader ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await safeReadBody(res);

  if (!res.ok) {
    const error: any = new Error(
      data?.message || data?.error || `Erro ${res.status} ao acessar ${path}`,
    );
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export const api = {
  get: <T = any>(path: string, headers?: HeadersLike) =>
    request<T>(path, { method: "GET", headers }),

  post: <T = any>(path: string, body?: any, headers?: HeadersLike) =>
    request<T>(path, { method: "POST", body, headers }),

  put: <T = any>(path: string, body?: any, headers?: HeadersLike) =>
    request<T>(path, { method: "PUT", body, headers }),

  patch: <T = any>(path: string, body?: any, headers?: HeadersLike) =>
    request<T>(path, { method: "PATCH", body, headers }),

  delete: <T = any>(path: string, headers?: HeadersLike) =>
    request<T>(path, { method: "DELETE", headers }),
};
