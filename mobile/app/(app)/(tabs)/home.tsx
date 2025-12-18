import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";

import { UI, styles as T } from "../../../src/theme/client-theme";

export default function Home() {
  const me = useMemo(
    () => ({
      name: "Bruno Leal",
      avatar: "https://i.pravatar.cc/200?img=12",
    }),
    [],
  );

  const next = useMemo(
    () => ({
      exists: true,
      serviceName: "Corte + Barba",
      unitName: "Unidade Centro",
      barberName: "Rafael",
      startsAtLabel: "Hoje • 15:30",
      statusLabel: "CONFIRMADO",
    }),
    [],
  );

  const products = useMemo(
    () => [
      { id: "1", name: "Pomada Matte", price: "R$ 49,90" },
      { id: "2", name: "Óleo de Barba", price: "R$ 39,90" },
      { id: "3", name: "Shampoo Black", price: "R$ 59,90" },
      { id: "4", name: "Pente Carbono", price: "R$ 19,90" },
    ],
    [],
  );

  return (
    <View style={[T.screen, { backgroundColor: "#141414" }]}>
      {/* HEADER */}
      <View style={[T.header, { justifyContent: "center" }]}>
        <View style={T.headerTitleWrap}>
          <FontAwesome name="scissors" size={18} color={UI.colors.white} />
          <Text style={T.headerTitle}>{UI.brand.name}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: UI.spacing.screenX,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + sino */}
        <View style={S.rowBelowHeader}>
          <View style={S.profileRow}>
            <Image source={{ uri: me.avatar }} style={S.avatar} />
            <View>
              <Text style={S.hello}>Olá,</Text>
              <Text style={S.name}>{me.name}</Text>
            </View>
          </View>

          <Pressable style={S.iconBtn}>
            <FontAwesome name="bell-o" size={20} color={UI.colors.white} />
            <View style={S.dot} />
          </Pressable>
        </View>

        {/* HERO CARD */}
        <View style={[S.heroCard, { marginTop: 14 }]}>
          <Text style={S.heroTitle}>Seu agendamento</Text>

          <View style={{ gap: 6 }}>
            <Text style={S.apptService}>{next.serviceName}</Text>
            <View style={S.metaRow}>
              {/* textos à esquerda */}
              <View style={S.metaTexts}>
                <Text style={S.apptMeta}>
                  {next.unitName} • {next.barberName}
                </Text>
                <Text style={S.apptMeta}>{next.startsAtLabel}</Text>
              </View>

              {/* badge à direita */}
              <View style={S.statusPill}>
                <FontAwesome
                  name="check"
                  size={12}
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
                <Text style={S.statusText}>{next.statusLabel}</Text>
              </View>
            </View>

            <View style={S.actionsRow}>
              <Pressable style={[S.actionBtn, S.actionDark]}>
                <Text style={S.actionText}>Alterar</Text>
              </Pressable>

              <Pressable style={[S.actionBtn, S.actionDark]}>
                <Text style={S.actionText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* PRODUTOS */}
        <View style={S.whiteArea}>
          <Text style={S.sectionTitle}>PRODUTOS</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {products.map((p) => (
              <Pressable key={p.id} style={S.productCard}>
                <View style={S.productThumb} />
                <Text style={S.productName}>{p.name}</Text>
                <Text style={S.productPrice}>{p.price}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  rowBelowHeader: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: UI.brand.primary,
  },
  hello: {
    color: UI.colors.textMuted,
    fontSize: 12,
  },
  name: {
    color: UI.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  dot: {
    position: "absolute",
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: UI.brand.primary,
  },

  heroCard: {
    backgroundColor: "#4c4c4c",
    borderRadius: UI.radius.card,
    padding: 24,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
  },
  apptService: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  apptMeta: {
    color: "#fff",
    fontSize: 13,
    opacity: 0.85,
  },

  // Badge CONFIRMADO (igual web)
  statusPill: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94)",
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "stretch", // 🔑 isso faz o badge crescer na vertical
    marginTop: 2,
  },

  metaTexts: {
    justifyContent: "space-between",
  },

  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionDark: {
    backgroundColor: "#141414",
  },
  actionText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },

  whiteArea: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 18,
    padding: 16,
  },
  sectionTitle: {
    color: "#0B0B10",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 12,
  },
  productCard: {
    width: 150,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#F3F4F6",
    marginRight: 12,
  },
  productThumb: {
    height: 84,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
    marginBottom: 10,
  },
  productName: {
    color: "#0B0B10",
    fontSize: 14,
    fontWeight: "800",
  },
  productPrice: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
});
