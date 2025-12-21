import * as SecureStore from "expo-secure-store";

export const AUTH_TOKEN_KEY = "auth_token";
const AUTH_SESSION_KEY = "auth_session";

/**
 * Base URL do backend
 *
 * ✅ Regra: sem EXPO_PUBLIC_API_URL, usamos localhost como fallback (DEV),
 * para evitar cair num ngrok antigo e gerar 403 misterioso.
 */
const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (__DEV__ ? "http://localhost:3000" : "");

if (!process.env.EXPO_PUBLIC_API_URL) {
  console.warn(
    "[api] EXPO_PUBLIC_API_URL não definido. Usando fallback:",
    API_URL,
  );
}

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

function tryExtractTokenFromSession(sessionJson: string | null): string | null {
  if (!sessionJson) return null;
  try {
    const parsed = JSON.parse(sessionJson);
    const t = parsed?.appToken;
    return typeof t === "string" && t.length > 10 ? t : null;
  } catch {
    return null;
  }
}

async function getAuthToken(): Promise<string | null> {
  // 1) fonte principal: auth_token
  const direct = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  if (direct) return direct;

  // 2) fallback: auth_session.appToken
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

  if (__DEV__) {
    console.log("[api]", options.method ?? "GET", path);
    console.log("[api] base:", API_URL);
    console.log("[api] token:", token ? `len=${token.length}` : "NONE");
  }

  const res = await fetch(joinUrl(API_URL, path), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

    if (__DEV__) console.log("[api] ❌ error:", error);
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
