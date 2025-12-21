import React from "react";
import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* ✅ aqui sim o "(tabs)" existe */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* ✅ esses dois são segmentos/pastas: booking/* e client/* */}
      <Stack.Screen name="booking" options={{ headerShown: false }} />
      <Stack.Screen name="client" options={{ headerShown: false }} />
    </Stack>
  );
}
