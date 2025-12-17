import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import { router, useSegments } from "expo-router";

const AUTH_STORAGE_KEY = "auth_token";

type AuthContextValue = {
  token: string | null;
  isBooting: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function devLog(...args: any[]) {
  if (__DEV__) console.log("[auth]", ...args);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const segments = useSegments();

  const [token, setToken] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);

  // 1) Boot: lê token do SecureStore
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        devLog("boot token:", stored ? "FOUND" : "NONE");
        setToken(stored ?? null);
      } catch (e) {
        devLog("boot read error:", e);
        setToken(null);
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

    devLog("route guard:", { group, hasToken: !!token });

    // Se não tem token e está dentro do app → manda pro login
    if (!token && inApp) {
      router.replace("/(auth)/login");
      return;
    }

    // Se tem token e está no auth → manda pro app
    if (token && inAuth) {
      router.replace("/(app)/(tabs)/home");
      return;
    }
  }, [token, isBooting, segments]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isBooting,
      signIn: async (newToken: string) => {
        await SecureStore.setItemAsync(AUTH_STORAGE_KEY, newToken);
        setToken(newToken);
        devLog("signIn OK");
      },
      signOut: async () => {
        await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
        setToken(null);
        devLog("signOut OK");
      },
    }),
    [token, isBooting],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider />");
  return ctx;
}
