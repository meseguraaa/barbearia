import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

const AUTH_STORAGE_KEY = "auth_token";

export default function Home() {
  const router = useRouter();

  async function handleLogout() {
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
    router.replace("/auth/login");
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#020617",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 16,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
        Home do Cliente ✅
      </Text>

      <Text style={{ color: "#9CA3AF", textAlign: "center" }}>
        Você está logado. Agora a gente pode fazer o layout com calma.
      </Text>

      <Pressable
        onPress={handleLogout}
        style={{
          marginTop: 16,
          backgroundColor: "#111827",
          paddingVertical: 12,
          paddingHorizontal: 18,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "#1F2937",
        }}
      >
        <Text style={{ color: "#F9FAFB", fontSize: 16, fontWeight: "600" }}>
          Sair
        </Text>
      </Pressable>
    </View>
  );
}
