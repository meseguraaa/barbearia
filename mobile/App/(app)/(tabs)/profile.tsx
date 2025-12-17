import { View, Text, Pressable } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";

export default function Profile() {
  const { signOut } = useAuth();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <Text>Perfil</Text>

      <Pressable
        onPress={signOut}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 10,
          borderWidth: 1,
        }}
      >
        <Text>Sair</Text>
      </Pressable>
    </View>
  );
}
