import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import { router, useSegments } from "expo-router";

import { apiFetch } from "../lib/api"; // ✅ ajusta se teu path for diferente

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
  /** Bearer token do app (use em Authorization: Bearer ...) */
  appToken: string | null;

  /** Usuário logado (vindo do backend) */
  user: AuthUser | null;

  /** Sessão inteira em JSON (se você quiser debugar/logar) */
  sessionJson: string | null;

  isBooting: boolean;

  /** Loading do /api/mobile/me (pra UI colocar "…" se quiser) */
  meLoading: boolean;

  /** Força revalidar usuário (re-fetch do /me) */
  refreshMe: () => Promise<void>;

  /** Recebe JSON string (compatível com teu Login.tsx atual) */
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

    // Aceita o formato novo: { appToken, user }
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
  return (
    msg.includes("missing_token") ||
    msg.includes("invalid_token") ||
    msg.includes("user_not_found") ||
    msg.includes("HTTP 401") ||
    msg.includes("401")
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const segments = useSegments();

  const [appToken, setAppToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionJson, setSessionJson] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);

  const [meLoading, setMeLoading] = useState(false);

  // Evita re-fetch repetido do /me quando já buscamos pra esse token
  const fetchedMeForTokenRef = useRef<string | null>(null);

  const signOut = async () => {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
    setAppToken(null);
    setUser(null);
    setSessionJson(null);
    fetchedMeForTokenRef.current = null;
    devLog("signOut OK");
  };

  const refreshMe = async (): Promise<void> => {
    if (!appToken) return;

    try {
      setMeLoading(true);

      const res = await apiFetch<{ user: any }>("/api/mobile/me");
      const u = res?.user;

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

      devLog("me refreshed OK");
    } catch (e: any) {
      devLog("me refresh error:", e?.message || e);

      if (isAuthInvalidError(e)) {
        try {
          await signOut();
        } finally {
          router.replace("/(auth)/login");
        }
      }
    } finally {
      setMeLoading(false);
    }
  };

  // 1) Boot: lê sessão do SecureStore
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        devLog("boot session:", stored ? "FOUND" : "NONE");

        if (!stored) {
          setAppToken(null);
          setUser(null);
          setSessionJson(null);
          return;
        }

        const s = parseSession(stored);
        if (!s) {
          devLog("boot: invalid session shape -> clearing");
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          setAppToken(null);
          setUser(null);
          setSessionJson(null);
          return;
        }

        setAppToken(s.appToken);
        setUser(s.user);
        setSessionJson(stored);
      } catch (e) {
        devLog("boot read error:", e);
        setAppToken(null);
        setUser(null);
        setSessionJson(null);
      } finally {
        setIsBooting(false);
      }
    })();
  }, []);

  // 2) Guard de rotas (redirect automático)
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

  // 3) Centraliza o "/me": quando tiver token, carrega dados do usuário uma vez
  useEffect(() => {
    if (isBooting) return;
    if (!appToken) return;

    if (fetchedMeForTokenRef.current === appToken) return;
    fetchedMeForTokenRef.current = appToken;

    let alive = true;

    (async () => {
      try {
        setMeLoading(true);

        const res = await apiFetch<{ user: any }>("/api/mobile/me");
        if (!alive) return;

        const u = res?.user;

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

        devLog("me boot-refresh OK");
      } catch (e: any) {
        devLog("me boot-refresh error:", e?.message || e);

        if (isAuthInvalidError(e)) {
          try {
            await signOut();
          } finally {
            router.replace("/(auth)/login");
          }
        }
      } finally {
        if (alive) setMeLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [appToken, isBooting]);

  const value = useMemo<AuthContextValue>(
    () => ({
      appToken,
      user,
      sessionJson,
      isBooting,
      meLoading,
      refreshMe,

      signIn: async (newSessionJson: string) => {
        const s = parseSession(newSessionJson);
        if (!s) {
          devLog("signIn: invalid session payload");
          await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
          setAppToken(null);
          setUser(null);
          setSessionJson(null);
          fetchedMeForTokenRef.current = null;
          return;
        }

        await SecureStore.setItemAsync(AUTH_STORAGE_KEY, newSessionJson);

        setAppToken(s.appToken);
        setUser(s.user);
        setSessionJson(newSessionJson);

        // libera novo fetch do /me pro token novo
        fetchedMeForTokenRef.current = null;

        devLog("signIn OK");
      },

      signOut,
    }),
    [appToken, user, sessionJson, isBooting, meLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider />");
  return ctx;
}
