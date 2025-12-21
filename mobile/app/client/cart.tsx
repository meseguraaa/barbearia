import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { UI } from "../../src/theme/client-theme";
import { api } from "../../src/services/api";

const STICKY_ROW_H = 74;

type CartItem = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
    category: string | null;
  } | null;
};

type CartOrder = {
  id: string;
  status: string;
  createdAt: string;
  reservedUntil: string | null;
  totalAmount: number;
  unitId: string;
  unitName: string;
  items: CartItem[];
};

type CartResponse = {
  ok?: boolean;
  order?: CartOrder;
  item?: CartOrder;
  error?: string;
  orders?: CartOrder[];
  items?: CartOrder[];
};

function formatMoneyBRL(value: number) {
  try {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  } catch {
    return `R$ ${Number(value || 0).toFixed(2)}`;
  }
}

function formatDateTimeBR(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pickParam(raw: unknown): string {
  if (!raw) return "";
  if (Array.isArray(raw)) return String(raw[0] ?? "").trim();
  return String(raw).trim();
}

function statusLabel(status?: string | null) {
  const s = String(status ?? "")
    .toUpperCase()
    .trim();
  if (s === "PENDING_CHECKIN") return "Pendente de retirada";
  if (s === "COMPLETED") return "Retirado (checkout concluído)";
  if (s === "CANCELED") return "Cancelado";
  if (!s) return "—";
  return s;
}

const Row = memo(function Row({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <View style={S.row}>
      <View style={S.rowIcon}>
        <FontAwesome name={icon} size={14} color={UI.brand.primaryText} />
      </View>
      <Text style={S.rowLabel}>{label}</Text>
      <Text style={S.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
});

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const params = useLocalSearchParams<{
    orderId?: string | string[];
    id?: string | string[];
  }>();

  const orderId = useMemo(() => {
    const fromOrderId = pickParam(params?.orderId);
    if (fromOrderId) return fromOrderId;
    return pickParam(params?.id);
  }, [params?.orderId, params?.id]);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<CartOrder | null>(null);
  const [failed, setFailed] = useState(false);

  const goBack = useCallback(() => {
    router.back();
  }, [router]);

  const goHome = useCallback(() => {
    // ✅ volta pra Home (e lá o focus effect atualiza o badge)
    router.replace("/");
  }, [router]);

  const goHistory = useCallback(() => {
    try {
      router.push("/history" as any);
    } catch {
      router.back();
    }
  }, [router]);

  const load = useCallback(async () => {
    if (!orderId) {
      if (__DEV__) console.log("[cart] missing orderId param");
      setLoading(false);
      setOrder(null);
      setFailed(false);
      return;
    }

    try {
      setFailed(false);
      setLoading(true);

      if (__DEV__) console.log("[cart] loading orderId:", orderId);

      const res: CartResponse = (await api.get(
        `/api/mobile/orders/${encodeURIComponent(orderId)}`,
      )) as any;

      if (__DEV__) console.log("[cart] response:", res);

      const direct = (res?.order ?? res?.item ?? null) as CartOrder | null;

      const list = (res?.orders ?? res?.items ?? []) as CartOrder[];
      const fromList =
        Array.isArray(list) && list.length
          ? (list.find((o) => String(o?.id) === String(orderId)) ?? null)
          : null;

      const o = direct ?? fromList;

      if (!res?.ok || !o?.id) {
        throw new Error("invalid_response");
      }

      setOrder(o);
    } catch (e: any) {
      console.log("[cart] load error:", e?.data ?? e?.message ?? e);
      Alert.alert("Ops", "Não foi possível carregar sua sacolinha agora.");
      setOrder(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const items = order?.items ?? [];

  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );

  const listPadTop = useMemo(
    () => insets.top + STICKY_ROW_H + 10,
    [insets.top],
  );

  const footerPadBottom = useMemo(
    () => Math.max(12, insets.bottom + 10),
    [insets.bottom],
  );

  const isPendingPickup = useMemo(() => {
    const s = String(order?.status ?? "")
      .toUpperCase()
      .trim();
    return s === "PENDING_CHECKIN";
  }, [order?.status]);

  const isCompleted = useMemo(() => {
    const s = String(order?.status ?? "")
      .toUpperCase()
      .trim();
    return s === "COMPLETED";
  }, [order?.status]);

  const isCanceled = useMemo(() => {
    const s = String(order?.status ?? "")
      .toUpperCase()
      .trim();
    return s === "CANCELED";
  }, [order?.status]);

  const Header = useMemo(() => {
    return (
      <View style={S.listHeader}>
        {!orderId ? (
          <View style={S.emptyHero}>
            <FontAwesome
              name="shopping-bag"
              size={18}
              color={UI.brand.primary}
            />
            <Text style={S.emptyTitle}>Sacolinha vazia</Text>
            <Text style={S.emptyText}>
              Volte para Produtos e toque em Reservar para adicionar itens.
            </Text>
          </View>
        ) : loading ? (
          <View style={S.emptyHero}>
            <ActivityIndicator />
            <Text style={S.emptyText}>Carregando sua sacolinha…</Text>
          </View>
        ) : failed || !order ? (
          <View style={S.emptyHero}>
            <FontAwesome name="warning" size={18} color={UI.brand.primary} />
            <Text style={S.emptyTitle}>Não foi possível abrir a sacolinha</Text>
            <Pressable style={S.primaryBtn} onPress={load}>
              <Text style={S.primaryBtnText}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={S.card}>
              <Row icon="shopping-bag" label="Pedido" value={order.id} />
              <Row icon="map-marker" label="Unidade" value={order.unitName} />
              <Row
                icon="info-circle"
                label="Status"
                value={statusLabel(order.status)}
              />
              <Row
                icon="clock-o"
                label="Reservado em"
                value={formatDateTimeBR(order.createdAt)}
              />
            </View>

            {isCompleted || isCanceled ? (
              <View style={[S.card, { marginTop: 10 }]}>
                <View style={S.statusBox}>
                  <View style={S.statusDot} />
                  <Text style={S.statusTitle}>
                    {isCompleted
                      ? "Este pedido já foi retirado ✅"
                      : "Este pedido foi cancelado"}
                  </Text>
                </View>

                <Text style={S.statusText}>
                  {isCompleted
                    ? "Quando o admin faz o checkout, ele sai da sacolinha e aparece no seu histórico."
                    : "Se precisar, você pode fazer uma nova reserva na lista de produtos."}
                </Text>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <Pressable style={[S.secondaryBtn]} onPress={goHome}>
                    <Text style={S.secondaryBtnText}>Ir pra Home</Text>
                  </Pressable>

                  {isCompleted ? (
                    <Pressable
                      style={[S.primaryBtn, { flex: 1 }]}
                      onPress={goHistory}
                    >
                      <Text style={S.primaryBtnText}>Ir pro histórico</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={S.sectionHeader}>
                <Text style={S.sectionTitle}>Itens</Text>
                <Text style={S.sectionSubtitle}>
                  Seus itens estão{" "}
                  <Text style={{ fontWeight: "900" }}>
                    pendentes de retirada
                  </Text>
                  . A confirmação final acontece no estabelecimento.
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    );
  }, [
    failed,
    load,
    loading,
    order,
    orderId,
    goHistory,
    goHome,
    isCompleted,
    isCanceled,
  ]);

  const renderItem = useCallback(({ item }: { item: CartItem }) => {
    const name = item.product?.name ?? "Produto";
    const category = item.product?.category ?? null;
    const imageUrl = item.product?.imageUrl ?? null;

    return (
      <View style={S.itemCard}>
        <View style={S.itemImageWrap}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={S.itemImage}
              resizeMode="cover"
            />
          ) : (
            <View style={S.itemImagePlaceholder}>
              <FontAwesome name="image" size={18} color={UI.colors.black45} />
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={S.itemName} numberOfLines={2}>
            {name}
          </Text>

          {category ? (
            <Text style={S.itemMeta} numberOfLines={1}>
              {category}
            </Text>
          ) : null}

          <View style={S.itemBottomRow}>
            <Text style={S.itemQty}>Qtd: {item.quantity}</Text>
            <Text style={S.itemPrice}>{formatMoneyBRL(item.totalPrice)}</Text>
          </View>
        </View>
      </View>
    );
  }, []);

  const onPressEntendi = useCallback(() => {
    Alert.alert(
      "Pendente de retirada",
      "Quando você for buscar, o admin faz o checkout e esse pedido vai direto pro seu histórico.",
      [{ text: "Ok", onPress: goHome }],
    );
  }, [goHome]);

  return (
    <View style={S.page}>
      <View style={S.fixedTop}>
        <View style={safeTopStyle} />

        <View style={S.stickyRow}>
          <Pressable style={S.backBtn} onPress={goBack}>
            <FontAwesome name="angle-left" size={22} color={UI.colors.white} />
          </Pressable>

          <View style={S.centerTitleWrap} pointerEvents="none">
            <Text style={S.centerTitle}>Sacolinha</Text>
          </View>

          <View style={{ width: 42, height: 42 }} />
        </View>
      </View>

      <FlatList
        data={order ? items : []}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        style={S.list}
        contentContainerStyle={[S.listContent, { paddingTop: listPadTop }]}
        ListHeaderComponent={Header}
        ListEmptyComponent={
          order && !loading ? (
            <View style={S.emptyHero}>
              <Text style={S.emptyTitle}>Sem itens</Text>
              <Text style={S.emptyText}>
                Sua sacolinha está vazia. Volte para Produtos e reserve um item.
              </Text>
            </View>
          ) : null
        }
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={9}
      />

      {order && !loading && isPendingPickup ? (
        <View style={[S.footer, { paddingBottom: footerPadBottom }]}>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>Total</Text>
            <Text style={S.totalValue}>
              {formatMoneyBRL(order.totalAmount)}
            </Text>
          </View>

          <Pressable style={S.primaryBtn} onPress={onPressEntendi}>
            <Text style={S.primaryBtnText}>Entendi</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const S = StyleSheet.create({
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
    alignItems: "center",
    gap: 12,
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
  },

  centerTitleWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  centerTitle: {
    color: UI.colors.white,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  list: { flex: 1, backgroundColor: UI.colors.white },
  listContent: { paddingBottom: 140 },

  listHeader: {
    paddingHorizontal: UI.spacing.screenX,
    paddingBottom: 12,
    backgroundColor: UI.colors.white,
  },

  emptyHero: {
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: "center",
    gap: 10,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: UI.brand.primaryText,
    textAlign: "center",
  },

  emptyText: {
    color: "rgba(0,0,0,0.55)",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
  },

  card: {
    marginTop: 6,
    backgroundColor: UI.colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.colors.black10,
    padding: 12,
    gap: 10,
  },

  row: { flexDirection: "row", alignItems: "center", gap: 10 },

  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: UI.colors.black05,
    alignItems: "center",
    justifyContent: "center",
  },

  rowLabel: {
    width: 92,
    fontSize: 12,
    color: UI.colors.black45,
    fontWeight: "700",
  },

  rowValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: UI.colors.black,
  },

  sectionHeader: {
    paddingTop: 18,
    paddingBottom: 10,
    backgroundColor: UI.colors.white,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: UI.brand.primaryText,
  },

  sectionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(0,0,0,0.50)",
  },

  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: UI.brand.primary,
  },

  statusTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: UI.brand.primaryText,
  },

  statusText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(0,0,0,0.55)",
    lineHeight: 18,
  },

  itemCard: {
    marginHorizontal: UI.spacing.screenX,
    marginBottom: 10,
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.colors.black10,
    backgroundColor: UI.colors.white,
  },

  itemImageWrap: {
    width: 62,
    height: 62,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: UI.colors.black05,
  },

  itemImage: { width: "100%", height: "100%" },

  itemImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  itemName: { fontSize: 14, fontWeight: "700", color: UI.brand.primaryText },

  itemMeta: {
    marginTop: 2,
    fontSize: 12,
    color: UI.colors.black45,
    fontWeight: "600",
  },

  itemBottomRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  itemQty: { fontSize: 12, color: UI.colors.black45, fontWeight: "700" },

  itemPrice: { fontSize: 13, fontWeight: "800", color: UI.brand.primaryText },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: UI.colors.white,
    borderTopWidth: 1,
    borderTopColor: UI.colors.black10,
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 12,
    gap: 10,
  },

  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  totalLabel: { fontSize: 13, color: UI.colors.black45, fontWeight: "800" },

  totalValue: { fontSize: 16, color: UI.brand.primaryText, fontWeight: "800" },

  primaryBtn: {
    height: 48,
    borderRadius: 16,
    backgroundColor: UI.brand.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtnText: { color: UI.colors.white, fontWeight: "800", fontSize: 14 },

  secondaryBtn: {
    height: 48,
    borderRadius: 16,
    backgroundColor: UI.colors.black05,
    borderWidth: 1,
    borderColor: UI.colors.black10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    flex: 1,
  },

  secondaryBtnText: {
    color: UI.brand.primaryText,
    fontWeight: "800",
    fontSize: 14,
  },
});
