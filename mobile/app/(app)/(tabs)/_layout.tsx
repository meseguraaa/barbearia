import { Tabs } from "expo-router";
import { View } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

import { UI } from "../../../src/theme/client-theme";

/* ---------------------------------------------------------
 * Ícone flutuante roxo (charme do app 😎)
 * ---------------------------------------------------------*/
function FloatingIcon({ name }: { name: any }) {
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: UI.brand.primary,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 40, // sobe o botão
        shadowOffset: { width: 0, height: 6 },
        elevation: 10,
      }}
    >
      <FontAwesome name={name} size={22} color="#FFF" />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: UI.brand.primary,
        tabBarInactiveTintColor: "#fff",
        tabBarStyle: {
          backgroundColor: "#141414",
          borderTopWidth: 0,
          height: 64,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
          marginBottom: 6,
        },
      }}
    >
      {/* HOME */}
      <Tabs.Screen
        name="home"
        options={{
          title: "Início",
          tabBarIcon: ({ focused }) =>
            focused ? (
              <FloatingIcon name="home" />
            ) : (
              <FontAwesome name="home" size={20} color="#fff" />
            ),
        }}
      />

      {/* PERFIL */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ focused }) =>
            focused ? (
              <FloatingIcon name="user" />
            ) : (
              <FontAwesome name="user" size={20} color="#fff" />
            ),
        }}
      />
    </Tabs>
  );
}
