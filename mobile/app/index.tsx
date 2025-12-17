import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/auth/auth-context";
import { UI } from "../src/theme/client-theme";

export default function Index() {
  const { token, isBooting } = useAuth();

  // Loader enquanto o AuthProvider faz o boot
  if (isBooting) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: UI.brand.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  // Token decide tudo
  if (token) {
    return <Redirect href="/(app)/(tabs)/home" />;
  }

  return <Redirect href="/(auth)/login" />;
}
