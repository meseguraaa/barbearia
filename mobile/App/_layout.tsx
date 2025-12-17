import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { UI } from "../src/theme/client-theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={UI.brand.primary} />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
