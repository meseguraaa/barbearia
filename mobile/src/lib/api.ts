// src/lib/api.ts
import * as SecureStore from "expo-secure-store";

const API_BASE_URL = "https://vagarious-gravely-filiberto.ngrok-free.dev";
const AUTH_STORAGE_KEY = "auth_token";

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
