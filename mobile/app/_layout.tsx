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
          {/* Tabs */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/* Wizard de agendamento (fora das tabs) */}
          <Stack.Screen name="booking" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
