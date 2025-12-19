import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  FlatList,
  ListRenderItemInfo,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UI } from "../../../src/theme/client-theme";

const STICKY_ROW_H = 74;

type Product = {
  id: string;
  name: string;
  price: string;
  oldPrice: string;
  image: string;
};

type HistoryItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  icon: string;
};

const ProductCard = memo(function ProductCard({
  item,
  showDivider,
}: {
  item: Product;
  showDivider: boolean;
}) {
  return (
    <View style={S.productCard}>
      <Image source={{ uri: item.image }} style={S.productImage} />
      <Text style={S.productName}>{item.name}</Text>
      <Text style={S.productOldPrice}>{item.oldPrice}</Text>
      <Text style={S.productPrice}>{item.price}</Text>

      {showDivider ? <View style={S.productDivider} /> : null}
    </View>
  );
});

const HistoryRow = memo(function HistoryRow({
  item,
  showDivider,
}: {
  item: HistoryItem;
  showDivider: boolean;
}) {
  return (
    <View style={S.historyItem}>
      <View style={S.historyLeft}>
        <View style={S.historyIcon}>
          <FontAwesome
            name={item.icon as any}
            size={18}
            color={UI.brand.primaryText}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.historyTitle}>{item.title}</Text>
          <Text style={S.historyDesc}>{item.description}</Text>
          <Text style={S.historyDate}>{item.date}</Text>
        </View>
      </View>

      {showDivider ? <View style={S.historyDivider} /> : null}
    </View>
  );
});

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

  const products = useMemo<Product[]>(
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

  const history = useMemo<HistoryItem[]>(
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

  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );

  const headerSpacerStyle = useMemo(
    () => ({ height: TOP_OFFSET, backgroundColor: UI.colors.bg }),
    [TOP_OFFSET],
  );

  // pintor do bounce superior (bem grande pra nunca "vazar branco" ao puxar pra baixo)
  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const keyProduct = useCallback((item: Product) => item.id, []);
  const renderProduct = useCallback(
    ({ item, index }: ListRenderItemInfo<Product>) => (
      <ProductCard item={item} showDivider={index < products.length - 1} />
    ),
    [products.length],
  );

  const keyHistory = useCallback((item: HistoryItem) => item.id, []);
  const renderHistory = useCallback(
    ({ item, index }: ListRenderItemInfo<HistoryItem>) => (
      <HistoryRow item={item} showDivider={index < history.length - 1} />
    ),
    [history.length],
  );

  const Header = useMemo(() => {
    return (
      <View>
        {/* ✅ garante topo escuro no overscroll */}
        <View
          pointerEvents="none"
          style={[S.topBounceDark, { height: topBounceHeight }]}
        />

        {/* spacer do topo fixo */}
        <View style={headerSpacerStyle} />

        {/* bloco escuro */}
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
                    color={UI.colors.black}
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

        {/* início do branco */}
        <View style={S.whiteArea}>
          <View style={S.whiteContent}>
            <Text style={S.sectionTitle}>Produtos</Text>

            <FlatList
              data={products}
              keyExtractor={keyProduct}
              renderItem={renderProduct}
              horizontal
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews
              initialNumToRender={3}
              maxToRenderPerBatch={4}
              windowSize={5}
            />

            <Pressable style={S.moreBtn}>
              <Text style={S.moreBtnText}>
                Toque para acessar mais produtos
              </Text>
            </Pressable>

            <Text style={[S.sectionTitle, S.sectionTitleSpacing]}>
              Histórico
            </Text>
          </View>
        </View>
      </View>
    );
  }, [
    headerSpacerStyle,
    keyProduct,
    next.barberName,
    next.serviceName,
    next.startsAtLabel,
    next.statusLabel,
    next.unitName,
    products.length,
    renderProduct,
    topBounceHeight,
  ]);

  return (
    <View style={S.page}>
      {/* TOPO FIXO */}
      <View style={S.fixedTop}>
        <View style={safeTopStyle} />

        <View style={S.stickyRow}>
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
      </View>

      {/* ✅ LISTA:
          - background branco aqui garante bottom overscroll branco
          - topo escuro é garantido pelo topBounceDark */}
      <FlatList
        data={history}
        keyExtractor={keyHistory}
        renderItem={renderHistory}
        showsVerticalScrollIndicator={false}
        style={S.list}
        contentContainerStyle={S.listContent}
        ListHeaderComponent={Header}
        removeClippedSubviews
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        updateCellsBatchingPeriod={50}
      />
    </View>
  );
}

const S = StyleSheet.create({
  // mundo por trás é escuro
  page: { flex: 1, backgroundColor: UI.colors.bg },

  fixedTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 999,
  },

  stickyRow: {
    height: STICKY_ROW_H,
    backgroundColor: UI.colors.bg,
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
  hello: { color: UI.colors.textMuted, fontSize: 12 },
  name: { color: UI.colors.text, fontSize: 16, fontWeight: "700" },

  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
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

  // ✅ fundo branco garante o rodapé branco ao puxar pra cima
  list: { flex: 1, backgroundColor: UI.colors.white },
  listContent: { paddingBottom: 24 },

  // ✅ garante topo escuro ao puxar pra baixo
  topBounceDark: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -1400,
    backgroundColor: UI.colors.bg,
  },

  darkShell: {
    backgroundColor: UI.colors.bg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  darkInner: {
    paddingHorizontal: UI.spacing.screenX,
    paddingBottom: UI.spacing.screenX,
  },

  heroCard: {
    marginTop: 14,
    backgroundColor: "rgba(124,108,255,0.22)",
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPad,
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.35)",
  },
  heroTitle: { color: UI.colors.text, fontSize: 18, fontWeight: "600" },
  apptService: {
    color: UI.colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
  },
  apptMeta: { color: UI.colors.textDim, fontSize: 13, marginTop: 2 },

  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    alignItems: "center",
    gap: 12,
  },

  statusPill: {
    flexDirection: "row",
    backgroundColor: UI.colors.success,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: "center",
  },
  statusText: { color: UI.colors.black, fontSize: 12, fontWeight: "700" },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    backgroundColor: UI.brand.primary,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
  },
  actionText: { color: UI.colors.text, fontWeight: "700" },

  whiteArea: { backgroundColor: UI.colors.white },
  whiteContent: {
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 18,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: UI.brand.primaryText,
  },
  sectionTitleSpacing: { marginTop: 28 },

  productCard: {
    width: 220,
    marginRight: 18,
    paddingRight: 18,
    position: "relative",
  },
  productImage: {
    height: 140,
    borderRadius: UI.radius.input,
    marginBottom: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  productName: {
    fontSize: 16,
    fontWeight: "600",
    color: UI.brand.primaryText,
  },
  productOldPrice: {
    textDecorationLine: "line-through",
    color: "rgba(0,0,0,0.45)",
    marginTop: 6,
  },
  productPrice: {
    fontSize: 20,
    fontWeight: "700",
    color: UI.brand.primaryText,
    marginTop: 6,
  },
  productDivider: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(0,0,0,0.10)",
  },

  // ✅ AGORA ROXO IGUAL "Alterar" e "Cancelar"
  moreBtn: {
    marginTop: 18,
    height: 56,
    backgroundColor: UI.brand.primary,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
  },
  moreBtnText: { color: UI.colors.text, fontSize: 15, fontWeight: "700" },

  historyItem: {
    paddingVertical: 16,
    paddingHorizontal: UI.spacing.screenX,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: UI.colors.white,
  },
  historyLeft: { flexDirection: "row", gap: 14, flex: 1, alignItems: "center" },
  historyIcon: {
    width: 36,
    height: 36,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  historyTitle: { fontWeight: "700", color: UI.brand.primaryText },
  historyDesc: { fontSize: 13, color: "rgba(0,0,0,0.65)", marginTop: 2 },
  historyDate: { fontSize: 12, color: "rgba(0,0,0,0.40)", marginTop: 2 },
  historyDivider: {
    position: "absolute",
    left: UI.spacing.screenX,
    right: UI.spacing.screenX,
    bottom: 0,
    height: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
});
