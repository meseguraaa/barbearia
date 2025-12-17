import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { FontAwesome5, AntDesign, FontAwesome } from "@expo/vector-icons";

import { UI, styles } from "../../src/theme/client-theme";

WebBrowser.maybeCompleteAuthSession();

const API_BASE_URL = "https://vagarious-gravely-filiberto.ngrok-free.dev";

const redirectUri = AuthSession.makeRedirectUri({
  scheme: "agendaplay",
  path: "auth",
});

const AUTH_STORAGE_KEY = "auth_token";

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);

  function goHomeSoon() {
    setTimeout(() => router.replace("/home"), 250);
  }

  async function handleProviderLogin(provider: "google" | "facebook") {
    try {
      setLoading(true);

      const callbackUrl = `${API_BASE_URL}/api/mobile/auth-redirect?redirect_uri=${encodeURIComponent(
        redirectUri,
      )}`;

      const authUrl = `${API_BASE_URL}/api/auth/signin/${provider}?callbackUrl=${encodeURIComponent(
        callbackUrl,
      )}`;

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        redirectUri,
      );

      if (result.type !== "success" || !result.url) {
        if (__DEV__) console.log("[OAuth] Login cancelado:", result.type);
        return;
      }

      const u = new URL(result.url);
      const error = u.searchParams.get("error");
      const token = u.searchParams.get("token");

      if (error) {
        console.log("[OAuth] Erro retornado:", error);
        return;
      }

      if (!token) {
        console.log("[OAuth] Token não retornou.");
        return;
      }

      const parsed = JSON.parse(decodeURIComponent(token));
      await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(parsed));

      if (__DEV__) console.log(`[OAuth] Logado com ${provider} ✅`);
      goHomeSoon();
    } catch (e) {
      console.log("[OAuth] Erro inesperado:", e);
      // UI silenciosa mesmo. Se quiser, pode deixar alert só em dev:
      // if (__DEV__) Alert.alert("Debug", "Erro ao logar (veja o console).");
    } finally {
      setLoading(false);
    }
  }

  function handleAppleLogin() {
    Alert.alert("Apple", "Em breve (integração Apple Sign-In).");
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor={UI.brand.primary} />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + 2,
          backgroundColor: UI.brand.primary,
          zIndex: 999,
        }}
      />

      <View
        style={[
          styles.header,
          {
            height: UI.spacing.headerH + insets.top,
            paddingTop: insets.top,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 14,
            zIndex: 1,
          },
        ]}
      >
        <View style={styles.headerTitleWrap}>
          <FontAwesome5 name="cut" size={18} color={UI.colors.white} />
          <Text style={styles.headerTitle}>{UI.brand.name}</Text>
        </View>
      </View>

      <View style={styles.body}>
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

          {/* ✅ removido: errorMessage / successMessage na UI */}

          <View style={styles.providerStack}>
            <Pressable
              onPress={() => handleProviderLogin("google")}
              disabled={loading}
              style={[
                styles.providerBtnFull,
                { paddingVertical: 18 },
                loading ? { opacity: 0.85 } : null,
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
                {loading ? (
                  <ActivityIndicator color={UI.brand.primaryText} />
                ) : (
                  <AntDesign name="google" size={22} color="#DB4437" />
                )}
                <Text
                  style={[
                    styles.providerBtnFullText,
                    { fontSize: 17, fontWeight: "500", letterSpacing: 0.25 },
                  ]}
                >
                  Continuar com Google
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => handleProviderLogin("facebook")}
              disabled={loading}
              style={[
                styles.providerBtnFull,
                { paddingVertical: 18 },
                loading ? { opacity: 0.85 } : null,
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
                {loading ? (
                  <ActivityIndicator color={UI.brand.primaryText} />
                ) : (
                  <FontAwesome name="facebook" size={22} color="#1877F2" />
                )}
                <Text
                  style={[
                    styles.providerBtnFullText,
                    { fontSize: 17, fontWeight: "500", letterSpacing: 0.25 },
                  ]}
                >
                  Continuar com Facebook
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={handleAppleLogin}
              disabled={loading || Platform.OS !== "ios"}
              style={[
                styles.providerBtnFull,
                { paddingVertical: 18 },
                loading || Platform.OS !== "ios" ? { opacity: 0.7 } : null,
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
                <Text
                  style={[
                    styles.providerBtnFullText,
                    { fontSize: 17, fontWeight: "500", letterSpacing: 0.25 },
                  ]}
                >
                  Apple ID
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
