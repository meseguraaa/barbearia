import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { UI } from "../src/theme/client-theme";
import { AuthProvider } from "../src/auth/auth-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" backgroundColor={UI.brand.primary} />
        <Stack screenOptions={{ headerShown: false }}>
          {/* ✅ Agora esses grupos vão existir porque vamos criar os _layout deles */}
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
