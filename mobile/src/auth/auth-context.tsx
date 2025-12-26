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

import { api, AUTH_TOKEN_KEY } from "../services/api";

const AUTH_STORAGE_KEY = "auth_session";

type Role = "CLIENT" | "BARBER" | "ADMIN";

type CustomerLevel = {
  id?: string | null;
  label: string;
  icon?: string | null;
};

type AuthUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  image?: string | null;

  phone?: string | null;

  // 🎂 vindo do backend (ou /me)
  birthday?: string | null;

  // ✅ claim/flag vindo do backend (JWT ou /me)
  profileComplete?: boolean | null;

  isOwner?: boolean;
  adminAccess?: any | null;
  customerLevel?: CustomerLevel | null;
};

type StoredSession = {
  appToken: string;
  user: AuthUser;
};

type AuthContextValue = {
  appToken: string | null;
  user: AuthUser | null;
  sessionJson: string | null;

  isBooting: boolean;
  meLoading: boolean;
  avatarReady: boolean;

  refreshMe: () => Promise<void>;
  signIn: (sessionJson: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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

function parseSession(sessionJson: string): StoredSession | null {
  try {
    const parsed = JSON.parse(sessionJson);
    if (!parsed || typeof parsed !== "object") return null;

    const appToken = pickToken(parsed);
    const user =
      parsed?.user && typeof parsed.user === "object"
        ? parsed.user
        : parsed?.session?.user && typeof parsed.session.user === "object"
          ? parsed.session.user
          : parsed?.data?.user && typeof parsed.data.user === "object"
            ? parsed.data.user
            : null;

    if (
      typeof appToken === "string" &&
      appToken.length > 0 &&
      user &&
      typeof user.id === "string" &&
      typeof user.email === "string" &&
      typeof user.role === "string"
    ) {
      return { appToken, user };
    }
    return null;
  } catch {
    return null;
  }
}

function isAuthInvalidError(e: any) {
  const msg = String(e?.message || "").toLowerCase();
  const status = Number(e?.status || e?.response?.status || 0);

  return (
    status === 401 ||
    msg.includes("missing_token") ||
    msg.includes("invalid_token") ||
    msg.includes("user_not_found") ||
    msg.includes("não autorizado") ||
    msg.includes("token ausente") ||
    msg.includes("http 401")
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

function normalizeCustomerLevel(u: any): CustomerLevel | null {
  const fromObj =
    u?.customerLevel && typeof u.customerLevel === "object"
      ? u.customerLevel
      : u?.level && typeof u.level === "object"
        ? u.level
        : null;

  const labelFromObj =
    fromObj?.label != null ? String(fromObj.label).trim() : "";

  const labelFromFlat =
    u?.levelLabel != null ? String(u.levelLabel).trim() : "";

  const label = labelFromObj || labelFromFlat;
  if (!label) return null;

  const iconFromObj = fromObj?.icon != null ? String(fromObj.icon).trim() : "";
  const iconFromFlat = u?.levelIcon != null ? String(u.levelIcon).trim() : "";

  const id =
    fromObj?.id != null && String(fromObj.id).trim()
      ? String(fromObj.id).trim()
      : u?.levelId != null && String(u.levelId).trim()
        ? String(u.levelId).trim()
        : null;

  const icon = (iconFromObj || iconFromFlat || "").trim();

  return { id, label, icon: icon || null };
}

function computeProfileComplete(u: AuthUser | null): boolean {
  if (!u) return true;

  // ✅ se backend já mandou o status, confia nele
  if (typeof u.profileComplete === "boolean") return u.profileComplete;

  // fallback: phone + birthday
  const phoneOk = typeof u.phone === "string" && u.phone.trim().length > 0;
  const bdayOk = typeof u.birthday === "string" && u.birthday.trim().length > 0;

  return phoneOk && bdayOk;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const segments = useSegments();

  const [appToken, setAppToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionJson, setSessionJson] = useState<string | null>(null);

  const [isBooting, setIsBooting] = useState(true);
  const [meLoading, setMeLoading] = useState(false);

  const [avatarReady, setAvatarReady] = useState(false);

  const fetchedMeForTokenRef = useRef<string | null>(null);
  const lastAvatarUrlRef = useRef<string | null>(null);
  const avatarPrefetchInFlightRef = useRef<Promise<void> | null>(null);
  const avatarRunIdRef = useRef(0);

  const ensureAvatarReady = async (maybeUrl?: string | null): Promise<void> => {
    const runId = avatarRunIdRef.current;

    const url = normalizeAvatarUrl(maybeUrl);
    if (!url) {
      lastAvatarUrlRef.current = null;
      if (avatarRunIdRef.current === runId) setAvatarReady(true);
      return;
    }

    if (lastAvatarUrlRef.current === url && avatarReady) return;

    if (lastAvatarUrlRef.current === url && avatarPrefetchInFlightRef.current) {
      await avatarPrefetchInFlightRef.current;
      return;
    }

    lastAvatarUrlRef.current = url;
    if (avatarRunIdRef.current === runId) setAvatarReady(false);

    const job = (async () => {
      await prefetchWithTimeout(url, 3000);
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

  const signOut = async () => {
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
  };

  const refreshMe = async (): Promise<void> => {
    if (!appToken) return;

    try {
      setMeLoading(true);

      const res = await api.get<{ user: any }>("/api/mobile/me");
      const u = (res as any)?.user;

      const normalizedLevel = normalizeCustomerLevel(u);

      setUser((prev) => {
        if (!prev) return prev;

        const next: AuthUser = {
          ...prev,
          id: (u?.id ?? prev.id) as any,
          name: (u?.name ?? prev.name) as any,
          email: (u?.email ?? prev.email) as any,
          image: (u?.image ?? prev.image) as any,
          phone: (u?.phone ?? prev.phone) as any,
          birthday: (u?.birthday ?? prev.birthday) as any,
          profileComplete: (u?.profileComplete ?? prev.profileComplete) as any,
          role: (u?.role ?? prev.role) as any,
          isOwner: (u?.isOwner ?? prev.isOwner) as any,
          adminAccess: (u?.adminAccess ?? prev.adminAccess) as any,
          customerLevel: normalizedLevel ?? prev.customerLevel ?? null,
        };

        return next;
      });

      await ensureAvatarReady(u?.image ?? null);
    } catch (e: any) {
      if (isAuthInvalidError(e)) {
        try {
          await signOut();
        } finally {
          router.replace("/(auth)/login");
        }
      } else {
        setAvatarReady(true);
      }
    } finally {
      setMeLoading(false);
    }
  };

  // Boot: lê sessão
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);

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

        await ensureAvatarReady(s.user?.image ?? null);
      } catch {
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
  }, []);

  // Guard de rotas (auth + profile gate)
  useEffect(() => {
    if (isBooting) return;

    const group = segments[0];
    const inAuth = group === "(auth)";
    const inApp = group === "(app)";

    // rota específica do profile (pra evitar loop)
    const inProfile = segments.join("/").includes("(tabs)/profile");

    if (!appToken && inApp) {
      router.replace("/(auth)/login");
      return;
    }

    if (appToken && inAuth) {
      router.replace("/(app)/(tabs)/home");
      return;
    }

    // ✅ novo: se logado e perfil incompleto, força profile
    if (appToken && inApp) {
      const ok = computeProfileComplete(user);
      if (!ok && !inProfile) {
        router.replace("/(app)/(tabs)/profile");
        return;
      }
    }
  }, [appToken, isBooting, segments, user]);

  // Boot-refresh do /me quando token mudar
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
        const normalizedLevel = normalizeCustomerLevel(u);

        setUser((prev) => {
          if (!prev) return prev;

          const next: AuthUser = {
            ...prev,
            id: (u?.id ?? prev.id) as any,
            name: (u?.name ?? prev.name) as any,
            email: (u?.email ?? prev.email) as any,
            image: (u?.image ?? prev.image) as any,
            phone: (u?.phone ?? prev.phone) as any,
            birthday: (u?.birthday ?? prev.birthday) as any,
            profileComplete: (u?.profileComplete ??
              prev.profileComplete) as any,
            role: (u?.role ?? prev.role) as any,
            isOwner: (u?.isOwner ?? prev.isOwner) as any,
            adminAccess: (u?.adminAccess ?? prev.adminAccess) as any,
            customerLevel: normalizedLevel ?? prev.customerLevel ?? null,
          };

          return next;
        });

        await ensureAvatarReady(u?.image ?? null);
      } catch (e: any) {
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
  }, [appToken, isBooting]);

  // Se o user.image mudar, tenta prefetch
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

        avatarRunIdRef.current += 1;
        await ensureAvatarReady(s.user?.image ?? null);
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
