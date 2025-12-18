import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  ImageBackground,
} from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { FontAwesome5, AntDesign, FontAwesome } from "@expo/vector-icons";

import { UI, styles } from "../../src/theme/client-theme";
import { useAuth } from "../../src/auth/auth-context";

WebBrowser.maybeCompleteAuthSession();

const API_BASE_URL = "https://vagarious-gravely-filiberto.ngrok-free.dev";

const redirectUri = AuthSession.makeRedirectUri({
  scheme: "agendaplay",
  path: "auth",
});

function devLog(...args: any[]) {
  if (__DEV__) console.log("[login]", ...args);
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleProviderLogin(provider: "google" | "facebook") {
    try {
      setLoading(true);

      devLog("redirectUri gerado:", redirectUri);

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
        devLog("Login cancelado:", result.type);
        return;
      }

      const u = new URL(result.url);
      const error = u.searchParams.get("error");
      const token = u.searchParams.get("token");

      if (error) {
        devLog("Erro OAuth:", error);
        return;
      }

      if (!token) {
        devLog("Token não retornou");
        return;
      }

      const parsed = JSON.parse(decodeURIComponent(token));
      await signIn(JSON.stringify(parsed));
    } catch (e) {
      devLog("Erro inesperado no login:", e);
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

      {/* Safe-area roxa */}
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

      {/* 🟣 CABEÇALHO */}
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

      {/* 📸 FUNDO */}
      <ImageBackground
        source={require("../../assets/images/home.png")}
        resizeMode="cover"
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}>
          {/* ⬇️ BODY empurra o card pra baixo */}
          <View
            style={[
              styles.body,
              {
                flex: 1,
                justifyContent: "flex-end",
                paddingBottom: "25%", // 🎯 AQUI está o ajuste
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
                  style={[
                    styles.providerBtnFull,
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
                    <Text style={styles.providerBtnFullText}>
                      Continuar com Google
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => handleProviderLogin("facebook")}
                  disabled={loading}
                  style={[
                    styles.providerBtnFull,
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
                    <Text style={styles.providerBtnFullText}>Apple ID</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}
