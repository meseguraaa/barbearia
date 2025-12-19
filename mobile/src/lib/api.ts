// src/lib/api.ts
import * as SecureStore from "expo-secure-store";

const API_BASE_URL = "https://vagarious-gravely-filiberto.ngrok-free.dev";
const AUTH_STORAGE_KEY = "auth_session";

type StoredSession = {
  appToken: string;
  user?: any;
};

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const sessionJson = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);

  let appToken: string | null = null;

  if (sessionJson) {
    try {
      const parsed = JSON.parse(sessionJson) as StoredSession;
      if (parsed && typeof parsed.appToken === "string") {
        appToken = parsed.appToken;
      }
    } catch {
      // se o storage estiver corrompido, só ignora e segue sem auth
      appToken = null;
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(appToken ? { Authorization: `Bearer ${appToken}` } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (data as any)?.error || (data as any)?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export * from "./api";
