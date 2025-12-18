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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UI } from "../../../src/theme/client-theme";

const STICKY_ROW_H = 74;

export default function Home() {
  const insets = useSafeAreaInsets();

  const me = useMemo(
    () => ({
      name: "Bruno Leal",
      avatar: "https://i.pravatar.cc/200?img=12",
    }),
    [],
  );

  const next = useMemo(
    () => ({
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
      {
        id: "1",
        name: "Pomada Matte Efeito Seco",
        price: "R$ 49,90",
        oldPrice: "R$ 59,90",
        image: "https://picsum.photos/seed/pomada/400/300",
      },
      {
        id: "2",
        name: "Óleo de Barba Premium",
        price: "R$ 39,90",
        oldPrice: "R$ 49,90",
        image: "https://picsum.photos/seed/oleo/400/300",
      },
      {
        id: "3",
        name: "Shampoo Black",
        price: "R$ 59,90",
        oldPrice: "R$ 69,90",
        image: "https://picsum.photos/seed/shampoo/400/300",
      },
      {
        id: "4",
        name: "Pente Carbono Anti-estático",
        price: "R$ 19,90",
        oldPrice: "R$ 29,90",
        image: "https://picsum.photos/seed/pente/400/300",
      },
    ],
    [],
  );

  const history = useMemo(
    () => [
      {
        id: "1",
        title: "Corte + Barba",
        description: "Unidade Centro • Aprovado",
        date: "Hoje às 15:30",
        icon: "scissors",
      },
      {
        id: "2",
        title: "Pomada Matte",
        description: "Compra de produto",
        date: "Ontem às 18:12",
        icon: "shopping-bag",
      },
      {
        id: "3",
        title: "Corte Masculino",
        description: "Unidade Sul • Cancelado",
        date: "10 de dez. às 14:20",
        icon: "calendar",
      },
      {
        id: "4",
        title: "Óleo de Barba",
        description: "Compra de produto",
        date: "08 de dez. às 19:01",
        icon: "shopping-bag",
      },
      {
        id: "5",
        title: "Barba",
        description: "Unidade Centro • Concluído",
        date: "05 de dez. às 11:45",
        icon: "check",
      },
    ],
    [],
  );

  const TOP_OFFSET = insets.top + STICKY_ROW_H;

  return (
    <View style={S.page}>
      {/* ✅ TOPO FIXO */}
      <View style={S.fixedTop}>
        {/* ✅ SAFE AREA ROXA */}
        <View
          style={{ height: insets.top, backgroundColor: UI.brand.primary }}
        />

        {/* ✅ LINHA FIXA */}
        <View style={S.stickyRow}>
          <View style={S.profileRow}>
            <Image source={{ uri: me.avatar }} style={S.avatar} />
            <View>
              <Text style={S.hello}>Olá,</Text>
              <Text style={S.name}>{me.name}</Text>
            </View>
          </View>

          <Pressable style={S.iconBtn}>
            <FontAwesome name="bell-o" size={20} color="#fff" />
            <View style={S.dot} />
          </Pressable>
        </View>
      </View>

      {/* ✅ SCROLL:
          - puxar pra BAIXO: aparece #141414 (top bounce dark)
          - puxar pra CIMA no final: aparece branco (background do ScrollView) */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={S.scroll} // ✅ branco (bottom bounce branco)
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* ✅ “pintura” do bounce de CIMA (iOS): um bloco gigante escuro atrás do topo */}
        <View
          pointerEvents="none"
          style={[S.topBounceDark, { height: TOP_OFFSET + 1200 }]}
        />

        {/* spacer pra compensar o topo fixo */}
        <View style={{ height: TOP_OFFSET, backgroundColor: "#141414" }} />

        {/* ✅ BLOCO ESCURO (com borda arredondada embaixo, por cima do branco) */}
        <View style={S.darkShell}>
          <View style={S.darkInner}>
            <View style={S.heroCard}>
              <Text style={S.heroTitle}>Seu agendamento</Text>

              <Text style={S.apptService}>{next.serviceName}</Text>

              <View style={S.metaRow}>
                <View>
                  <Text style={S.apptMeta}>
                    {next.unitName} • {next.barberName}
                  </Text>
                  <Text style={S.apptMeta}>{next.startsAtLabel}</Text>
                </View>

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
                <Pressable style={S.actionBtn}>
                  <Text style={S.actionText}>Alterar</Text>
                </Pressable>
                <Pressable style={S.actionBtn}>
                  <Text style={S.actionText}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* ✅ CONTEÚDO BRANCO (ocupa o resto da tela) */}
        <View style={S.whiteArea}>
          <View style={S.whiteContent}>
            <Text style={S.sectionTitle}>Produtos</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {products.map((p, idx) => (
                <View key={p.id} style={S.productCard}>
                  <Image source={{ uri: p.image }} style={S.productImage} />
                  <Text style={S.productName}>{p.name}</Text>
                  <Text style={S.productOldPrice}>{p.oldPrice}</Text>
                  <Text style={S.productPrice}>{p.price}</Text>

                  {idx < products.length - 1 && (
                    <View style={S.productDivider} />
                  )}
                </View>
              ))}
            </ScrollView>

            <Pressable style={S.moreBtn}>
              <Text style={S.moreBtnText}>
                Toque para acessar mais produtos
              </Text>
            </Pressable>

            <Text style={[S.sectionTitle, { marginTop: 28 }]}>Histórico</Text>

            {history.map((item, idx) => (
              <View key={item.id} style={S.historyItem}>
                <View style={S.historyLeft}>
                  <View style={S.historyIcon}>
                    <FontAwesome
                      name={item.icon as any}
                      size={18}
                      color="#0B0B10"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.historyTitle}>{item.title}</Text>
                    <Text style={S.historyDesc}>{item.description}</Text>
                    <Text style={S.historyDate}>{item.date}</Text>
                  </View>
                </View>

                {idx < history.length - 1 && <View style={S.historyDivider} />}
              </View>
            ))}

            <Pressable style={S.historyMoreBtn}>
              <Text style={S.historyMoreText}>Ver tudo</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFFFF" },

  fixedTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 999,
  },

  stickyRow: {
    height: STICKY_ROW_H,
    backgroundColor: "#141414",
    paddingHorizontal: UI.spacing.screenX,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  profileRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: UI.brand.primary,
  },
  hello: { color: "#9CA3AF", fontSize: 12 },
  name: { color: "#fff", fontSize: 16, fontWeight: "800" },

  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
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

  scroll: {
    flex: 1,
    backgroundColor: "#FFFFFF", // ✅ bottom bounce branco
  },

  // ✅ isso “pinta” o bounce de cima de escuro
  topBounceDark: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -1200,
    backgroundColor: "#141414",
  },

  darkShell: {
    backgroundColor: "#141414",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  darkInner: {
    paddingHorizontal: UI.spacing.screenX,
    paddingBottom: UI.spacing.screenX,
  },

  heroCard: {
    backgroundColor: "#4c4c4c",
    borderRadius: 18,
    padding: 24,
  },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "700" },
  apptService: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 6 },
  apptMeta: { color: "#fff", fontSize: 13, opacity: 0.85 },

  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    alignItems: "center",
  },

  statusPill: {
    flexDirection: "row",
    backgroundColor: "rgb(34,197,94)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: "center",
  },
  statusText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    backgroundColor: "#141414",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionText: { color: "#fff", fontWeight: "800" },

  whiteArea: {
    backgroundColor: "#FFFFFF", // ✅ garante branco ocupando tudo abaixo
    paddingBottom: 24,
  },

  whiteContent: {
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 18,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 12,
    color: "#0B0B10",
  },

  productCard: {
    width: 220,
    marginRight: 18,
    paddingRight: 18,
    position: "relative",
  },
  productImage: {
    height: 140,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: "#F3F4F6",
  },
  productName: { fontSize: 16, fontWeight: "700", color: "#0B0B10" },
  productOldPrice: {
    textDecorationLine: "line-through",
    color: "rgba(0,0,0,0.4)",
    marginTop: 6,
  },
  productPrice: {
    fontSize: 20,
    fontWeight: "500",
    color: "#0B0B10",
    marginTop: 6,
  },
  productDivider: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
  },

  moreBtn: {
    marginTop: 18,
    height: 56,
    backgroundColor: "#141414",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  moreBtnText: { color: "#fff", fontSize: 16 },

  historyItem: {
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyLeft: { flexDirection: "row", gap: 14, flex: 1, alignItems: "center" },
  historyIcon: {
    width: 36,
    height: 36,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  historyTitle: { fontWeight: "700", color: "#0B0B10" },
  historyDesc: { fontSize: 13, color: "#374151", marginTop: 2 },
  historyDate: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  historyDivider: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
  },

  historyMoreBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  historyMoreText: { fontWeight: "600", color: "#0B0B10" },
});
