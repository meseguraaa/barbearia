import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import { Image } from "react-native";
import { router, useSegments } from "expo-router";

import { api } from "../services/api"; // ✅ usa o MESMO client do app
import { AUTH_TOKEN_KEY } from "../services/api"; // ✅ chave única do token

const AUTH_STORAGE_KEY = "auth_session";

type Role = "CLIENT" | "BARBER" | "ADMIN";

type AuthUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  image?: string | null;
  phone?: string | null;
  isOwner?: boolean;
  adminAccess?: any | null;
};

type StoredSession = {
  appToken: string; // ✅ Bearer token do app
  user: AuthUser;
};

type AuthContextValue = {
  appToken: string | null;
  user: AuthUser | null;
  sessionJson: string | null;

  isBooting: boolean;
  meLoading: boolean;

  // ✅ NOVO: controla quando o avatar está pronto (prefetch OK ou fallback)
  avatarReady: boolean;

  refreshMe: () => Promise<void>;

  signIn: (sessionJson: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function devLog(...args: any[]) {
  if (__DEV__) console.log("[auth]", ...args);
}

function parseSession(sessionJson: string): StoredSession | null {
  try {
    const parsed = JSON.parse(sessionJson);

    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.appToken === "string" &&
      parsed.user &&
      typeof parsed.user === "object" &&
      typeof parsed.user.id === "string" &&
      typeof parsed.user.email === "string" &&
      typeof parsed.user.role === "string"
    ) {
      return {
        appToken: parsed.appToken,
        user: parsed.user,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function isAuthInvalidError(e: any) {
  const msg = String(e?.message || "");
  const status = Number(e?.status || e?.response?.status || 0);

  return (
    status === 401 ||
    msg.includes("missing_token") ||
    msg.includes("invalid_token") ||
    msg.includes("user_not_found") ||
    msg.includes("HTTP 401") ||
    msg.includes("401") ||
    msg.toLowerCase().includes("não autorizado")
  );
}

function normalizeAvatarUrl(url?: string | null) {
  const u = (url || "").trim();
  return u.length ? u : null;
}

async function prefetchWithTimeout(url: string, timeoutMs: number) {
  let timeoutId: any = null;

  const prefetchPromise = Image.prefetch(url)
    .then(() => "prefetch_ok")
    .catch(() => "prefetch_error");

  const timeoutPromise = new Promise<string>((resolve) => {
    timeoutId = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  const result = await Promise.race([prefetchPromise, timeoutPromise]);

  if (timeoutId) clearTimeout(timeoutId);

  return result;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const segments = useSegments();

  const [appToken, setAppToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionJson, setSessionJson] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [meLoading, setMeLoading] = useState(false);

  // ✅ NOVO
  const [avatarReady, setAvatarReady] = useState(false);

  const fetchedMeForTokenRef = useRef<string | null>(null);

  // ✅ controla prefetch para não ficar repetindo sem necessidade
  const lastAvatarUrlRef = useRef<string | null>(null);
  const avatarPrefetchInFlightRef = useRef<Promise<void> | null>(null);

  // ✅ evita setState de prefetch antigo após trocar de sessão/URL
  const avatarRunIdRef = useRef(0);

  const signOut = async () => {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY); // ✅ apaga token “real” também

    setAppToken(null);
    setUser(null);
    setSessionJson(null);
    fetchedMeForTokenRef.current = null;

    // ✅ reset do estado do avatar
    setAvatarReady(false);
    lastAvatarUrlRef.current = null;
    avatarPrefetchInFlightRef.current = null;

    // ✅ invalida qualquer prefetch antigo
    avatarRunIdRef.current += 1;

    devLog("signOut OK");
  };

  const ensureAvatarReady = async (maybeUrl?: string | null): Promise<void> => {
    const runId = avatarRunIdRef.current;

    // Sem avatar -> libera imediatamente
    const url = normalizeAvatarUrl(maybeUrl);
    if (!url) {
      lastAvatarUrlRef.current = null;
      // só aplica se ainda for o mesmo run
      if (avatarRunIdRef.current === runId) setAvatarReady(true);
      return;
    }

    // Se já carregamos essa URL e já está pronto, não faz nada.
    if (lastAvatarUrlRef.current === url && avatarReady) return;

    // Se já está em andamento para a mesma URL, aguarda.
    if (lastAvatarUrlRef.current === url && avatarPrefetchInFlightRef.current) {
      await avatarPrefetchInFlightRef.current;
      return;
    }

    // Nova URL: trava o gate (avatarReady=false) e tenta prefetch com timeout.
    lastAvatarUrlRef.current = url;
    if (avatarRunIdRef.current === runId) setAvatarReady(false);

    const job = (async () => {
      const result = await prefetchWithTimeout(url, 3000);
      devLog("avatar prefetch result:", result);

      // Tanto sucesso quanto erro/timeout liberam (placeholder se falhar)
      if (avatarRunIdRef.current === runId) setAvatarReady(true);
    })();

    avatarPrefetchInFlightRef.current = job;

    try {
      await job;
    } finally {
      if (avatarPrefetchInFlightRef.current === job) {
        avatarPrefetchInFlightRef.current = null;
      }
    }
  };

  const refreshMe = async (): Promise<void> => {
    if (!appToken) return;

    try {
      setMeLoading(true);

      const res = await api.get<{ user: any }>("/api/mobile/me");
      const u = (res as any)?.user;

      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          name: (u?.name ?? prev.name) as any,
          email: (u?.email ?? prev.email) as any,
          image: (u?.image ?? prev.image) as any,
          phone: (u?.phone ?? prev.phone) as any,
          role: (u?.role ?? prev.role) as any,
          isOwner: (u?.isOwner ?? prev.isOwner) as any,
          adminAccess: (u?.adminAccess ?? prev.adminAccess) as any,
          id: (u?.id ?? prev.id) as any,
        };
      });

      // ✅ GATE: avatar (timeout 3s + fallback)
      await ensureAvatarReady(u?.image ?? null);

      devLog("me refreshed OK");
    } catch (e: any) {
      devLog("me refresh error:", e?.message || e);

      if (isAuthInvalidError(e)) {
        try {
          await signOut();
        } finally {
          router.replace("/(auth)/login");
        }
      } else {
        // Em erro genérico, não trava a app por causa de avatar.
        setAvatarReady(true);
      }
    } finally {
      setMeLoading(false);
    }
  };

  // 1) Boot: lê sessão do SecureStore
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        devLog("boot session:", stored ? "FOUND" : "NONE");

        if (!stored) {
          if (!alive) return;
          setAppToken(null);
          setUser(null);
          setSessionJson(null);
          setAvatarReady(false);
          return;
        }

        const s = parseSession(stored);
        if (!s) {
          devLog("boot: invalid session shape -> clearing");
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);

          if (!alive) return;
          setAppToken(null);
          setUser(null);
          setSessionJson(null);
          setAvatarReady(false);
          return;
        }

        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, s.appToken);

        if (!alive) return;
        setAppToken(s.appToken);
        setUser(s.user);
        setSessionJson(stored);

        // ✅ tenta prefetch do avatar salvo na sessão (se existir)
        await ensureAvatarReady(s.user?.image ?? null);
      } catch (e) {
        devLog("boot read error:", e);

        if (!alive) return;
        setAppToken(null);
        setUser(null);
        setSessionJson(null);
        setAvatarReady(false);
      } finally {
        if (alive) setIsBooting(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Guard de rotas
  useEffect(() => {
    if (isBooting) return;

    const group = segments[0]; // "(auth)" | "(app)" | undefined
    const inAuth = group === "(auth)";
    const inApp = group === "(app)";

    devLog("route guard:", { group, hasToken: !!appToken });

    if (!appToken && inApp) {
      router.replace("/(auth)/login");
      return;
    }

    if (appToken && inAuth) {
      router.replace("/(app)/(tabs)/home");
      return;
    }
  }, [appToken, isBooting, segments]);

  // 3) Boot-refresh do /me quando token mudar
  useEffect(() => {
    if (isBooting) return;
    if (!appToken) return;

    if (fetchedMeForTokenRef.current === appToken) return;
    fetchedMeForTokenRef.current = appToken;

    let alive = true;

    (async () => {
      try {
        setMeLoading(true);

        const res = await api.get<{ user: any }>("/api/mobile/me");
        if (!alive) return;

        const u = (res as any)?.user;

        setUser((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            name: (u?.name ?? prev.name) as any,
            email: (u?.email ?? prev.email) as any,
            image: (u?.image ?? prev.image) as any,
            phone: (u?.phone ?? prev.phone) as any,
            role: (u?.role ?? prev.role) as any,
            isOwner: (u?.isOwner ?? prev.isOwner) as any,
            adminAccess: (u?.adminAccess ?? prev.adminAccess) as any,
            id: (u?.id ?? prev.id) as any,
          };
        });

        // ✅ garante avatar pronto após boot-refresh
        await ensureAvatarReady(u?.image ?? null);

        devLog("me boot-refresh OK");
      } catch (e: any) {
        devLog("me boot-refresh error:", e?.message || e);

        if (isAuthInvalidError(e)) {
          try {
            await signOut();
          } finally {
            router.replace("/(auth)/login");
          }
        } else {
          if (alive) setAvatarReady(true);
        }
      } finally {
        if (alive) setMeLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appToken, isBooting]);

  // ✅ Se o user.image mudar, garante prefetch (timeout + fallback)
  useEffect(() => {
    if (isBooting) return;
    if (!appToken) return;

    const url = normalizeAvatarUrl(user?.image ?? null);

    if (!url) {
      setAvatarReady(true);
      return;
    }

    if (lastAvatarUrlRef.current !== url) {
      ensureAvatarReady(url).catch(() => setAvatarReady(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.image, appToken, isBooting]);

  const value = useMemo<AuthContextValue>(
    () => ({
      appToken,
      user,
      sessionJson,
      isBooting,
      meLoading,
      avatarReady,
      refreshMe,

      signIn: async (newSessionJson: string) => {
        const s = parseSession(newSessionJson);
        if (!s) {
          devLog("signIn: invalid session payload");
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);

          setAppToken(null);
          setUser(null);
          setSessionJson(null);
          fetchedMeForTokenRef.current = null;

          setAvatarReady(false);
          lastAvatarUrlRef.current = null;
          avatarPrefetchInFlightRef.current = null;

          avatarRunIdRef.current += 1;

          return;
        }

        await SecureStore.setItemAsync(AUTH_STORAGE_KEY, newSessionJson);
        await SecureStore.setItemAsync(AUTH_TOKEN_KEY, s.appToken);

        setAppToken(s.appToken);
        setUser(s.user);
        setSessionJson(newSessionJson);

        fetchedMeForTokenRef.current = null;

        // ✅ novo ciclo de avatar
        avatarRunIdRef.current += 1;
        await ensureAvatarReady(s.user?.image ?? null);

        devLog("signIn OK");
      },

      signOut,
    }),
    [appToken, user, sessionJson, isBooting, meLoading, avatarReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider />");
  return ctx;
}
