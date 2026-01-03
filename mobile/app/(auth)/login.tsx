import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  ImageBackground,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { FontAwesome5, AntDesign, FontAwesome } from "@expo/vector-icons";

import { UI, styles } from "../../src/theme/client-theme";
import { useAuth } from "../../src/auth/auth-context";

WebBrowser.maybeCompleteAuthSession();

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (__DEV__ ? "http://localhost:3000" : "");

// ✅ companyId obrigatório no fluxo mobile (multi-tenant REAL)
const COMPANY_ID = process.env.EXPO_PUBLIC_COMPANY_ID?.trim() || "";

// ✅ redirectUri (deep link do app)
const redirectUri = (() => {
  try {
    // path "auth" precisa bater com seu endpoint /api/mobile/auth-redirect
    return AuthSession.makeRedirectUri({ scheme: "agendaplay", path: "auth" });
  } catch {
    // fallback duro, mas evita crash em ambientes estranhos
    return "agendaplay://auth";
  }
})();

function parseSessionParam(value: string): any | null {
  try {
    const decoded = decodeURIComponent(value);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function safeParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function ensureCompanyIdInSession(session: any, companyId: string) {
  if (!session || typeof session !== "object") return session;

  const cid = String(companyId || "").trim();
  if (!cid) return session;

  // já existe em algum lugar? ok
  const already =
    String(session?.companyId ?? "").trim() ||
    String(session?.company_id ?? "").trim() ||
    String(session?.tenantId ?? "").trim() ||
    String(session?.tenant_id ?? "").trim() ||
    String(session?.user?.companyId ?? "").trim() ||
    String(session?.user?.company?.id ?? "").trim() ||
    String(session?.session?.companyId ?? "").trim() ||
    String(session?.data?.companyId ?? "").trim();

  if (already) return session;

  // injeta de forma “compat”
  const next = { ...session };

  // 1) raiz
  next.companyId = cid;

  // 2) user (se existir)
  if (next.user && typeof next.user === "object") {
    next.user = { ...next.user, companyId: cid };
  }

  // 3) session.user (se existir)
  if (next.session && typeof next.session === "object") {
    next.session = { ...next.session, companyId: cid };
    if (next.session.user && typeof next.session.user === "object") {
      next.session.user = { ...next.session.user, companyId: cid };
    }
  }

  // 4) data.user (se existir)
  if (next.data && typeof next.data === "object") {
    next.data = { ...next.data, companyId: cid };
    if (next.data.user && typeof next.data.user === "object") {
      next.data.user = { ...next.data.user, companyId: cid };
    }
  }

  return next;
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const { signIn, refreshMe } = useAuth();

  const [loading, setLoading] = useState(false);

  const apiOk = useMemo(() => Boolean(API_BASE_URL), []);
  const companyOk = useMemo(() => Boolean(COMPANY_ID), []);

  async function handleProviderLogin(provider: "google" | "facebook") {
    if (loading) return;

    try {
      if (!apiOk) {
        Alert.alert(
          "Login",
          "API do app não configurada (EXPO_PUBLIC_API_URL).",
        );
        return;
      }

      if (!companyOk) {
        Alert.alert(
          "Login",
          "Aplicativo sem empresa configurada (EXPO_PUBLIC_COMPANY_ID).",
        );
        return;
      }

      setLoading(true);

      // ✅ callbackUrl: backend -> /api/mobile/auth-redirect (ele devolve para o deep link do app)
      const callback = new URL(`${API_BASE_URL}/api/mobile/auth-redirect`);
      callback.searchParams.set(
        "redirect_uri",
        encodeURIComponent(String(redirectUri)),
      );
      callback.searchParams.set("companyId", COMPANY_ID);

      const auth = new URL(`${API_BASE_URL}/api/auth/signin/${provider}`);
      auth.searchParams.set("callbackUrl", callback.toString());

      const result = await WebBrowser.openAuthSessionAsync(
        auth.toString(),
        String(redirectUri),
        {
          // ✅ no iOS ajuda muito em dev/testes (evita cookies grudados)
          preferEphemeralSession: Platform.OS === "ios",
        },
      );

      // cancel/dismiss: usuário fechou, não é erro
      if (result.type !== "success" || !result.url) return;

      const url = safeParseUrl(result.url);
      if (!url) {
        Alert.alert("Login", "Retorno inválido do provedor. Tente novamente.");
        return;
      }

      const error = url.searchParams.get("error");
      const message = url.searchParams.get("message");

      if (error) {
        Alert.alert(
          "Login",
          message || `Não foi possível autenticar (${error}).`,
        );
        return;
      }

      const payloadParam =
        url.searchParams.get("token") || url.searchParams.get("session");

      if (!payloadParam) {
        Alert.alert(
          "Login",
          "Não recebemos a sessão do login. Tente novamente.",
        );
        return;
      }

      const parsed = parseSessionParam(payloadParam);
      if (!parsed) {
        Alert.alert(
          "Login",
          "Sessão inválida retornada pelo login. Tente novamente.",
        );
        return;
      }

      // ✅ garante companyId dentro do payload (caso backend não inclua)
      const session = ensureCompanyIdInSession(parsed, COMPANY_ID);

      // ✅ 1) salva sessão/token (AuthProvider injeta token/companyId na memória do api)
      await signIn(JSON.stringify(session));

      // ✅ 2) warm-up do /me (acelera home e resolve dados do perfil)
      try {
        await refreshMe();
      } catch {
        // ok: guard/refresh automático ainda cobre
      }
    } catch {
      Alert.alert("Login", "Erro inesperado ao autenticar.");
    } finally {
      setLoading(false);
    }
  }

  function handleAppleLogin() {
    Alert.alert("Apple", "Em breve (Apple Sign-In).");
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor={UI.brand.primary} />

      {/* Safe-area */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + 2,
          backgroundColor: UI.brand.primary,
          zIndex: 10,
        }}
      />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            height: UI.spacing.headerH + insets.top,
            paddingTop: insets.top,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 14,
          },
        ]}
      >
        <View style={styles.headerTitleWrap}>
          <FontAwesome5 name="cut" size={18} color={UI.colors.white} />
          <Text style={styles.headerTitle}>{UI.brand.name}</Text>
        </View>
      </View>

      {/* Background */}
      <ImageBackground
        source={require("../../assets/images/home.png")}
        resizeMode="cover"
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}>
          <View
            style={[
              styles.body,
              {
                flex: 1,
                justifyContent: "flex-end",
                paddingBottom: "25%",
              },
            ]}
          >
            <View style={[styles.card, UI.shadow.card]}>
              <Text
                style={[
                  styles.title,
                  { textAlign: "center", fontSize: 26, marginBottom: 10 },
                ]}
              >
                Acesse sua conta
              </Text>

              <Text
                style={[
                  styles.subtitle,
                  { textAlign: "center", fontSize: 15, marginBottom: 18 },
                ]}
              >
                Entre com sua conta social
              </Text>

              <View style={styles.providerStack}>
                <Pressable
                  onPress={() => handleProviderLogin("google")}
                  disabled={loading}
                  style={[styles.providerBtnFull, loading && { opacity: 0.85 }]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                    }}
                  >
                    {loading ? (
                      <ActivityIndicator color={UI.brand.primaryText} />
                    ) : (
                      <AntDesign name="google" size={22} color="#DB4437" />
                    )}
                    <Text style={styles.providerBtnFullText}>
                      Continuar com Google
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => handleProviderLogin("facebook")}
                  disabled={loading}
                  style={[styles.providerBtnFull, loading && { opacity: 0.85 }]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                    }}
                  >
                    <FontAwesome name="facebook" size={22} color="#1877F2" />
                    <Text style={styles.providerBtnFullText}>
                      Continuar com Facebook
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={handleAppleLogin}
                  disabled={loading || Platform.OS !== "ios"}
                  style={[
                    styles.providerBtnFull,
                    (loading || Platform.OS !== "ios") && { opacity: 0.7 },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                    }}
                  >
                    <FontAwesome name="apple" size={24} color="#111827" />
                    <Text style={styles.providerBtnFullText}>Apple ID</Text>
                  </View>
                </Pressable>
              </View>

              {/* dica útil em dev */}
              {__DEV__ && (!apiOk || !companyOk) ? (
                <View style={{ marginTop: 12 }}>
                  {!apiOk ? (
                    <Text style={styles.subtitle}>
                      Configure EXPO_PUBLIC_API_URL (ex:
                      https://xxxx.ngrok-free.dev)
                    </Text>
                  ) : null}
                  {!companyOk ? (
                    <Text style={styles.subtitle}>
                      Configure EXPO_PUBLIC_COMPANY_ID (id da empresa no banco)
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}
