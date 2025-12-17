import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";

const AUTH_STORAGE_KEY = "auth_token";

export default function Index() {
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const token = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        if (!mounted) return;
        setHasToken(!!token);
      } finally {
        if (mounted) setReady(true);
      }
    }

    boot();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#020617",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  // ✅ se tiver token, vai pra Home (rota que vamos criar agora)
  if (hasToken) {
    return <Redirect href="/home" />;
  }

  return <Redirect href="/auth/login" />;
}
