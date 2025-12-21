import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  FlatList,
  ListRenderItemInfo,
  Alert,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { UI } from "../../../src/theme/client-theme";
import { useAuth } from "../../../src/auth/auth-context";
import { api } from "../../../src/services/api";

import { ScreenGate } from "../../../src/components/layout/ScreenGate";
import { HomeSkeleton } from "../../../src/components/loading/HomeSkeleton";

const STICKY_ROW_H = 74;

type Product = {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  unitName: string;
  isOutOfStock: boolean;
};

type HistoryItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  icon: string;
};

type NextAppt = {
  id: string;
  serviceName: string;
  unitName: string;
  barberName: string;
  startsAtLabel: string;
  statusLabel: string;
  status?: string | null;
  unitId?: string | null;
  serviceId?: string | null;
  barberId?: string | null;
  canReschedule?: boolean;
  canCancel?: boolean;
  cancellationFeeEligible?: boolean;
  cancellationFeeNotice?: string | null;
};

function formatBRL(value: number) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  } catch {
    const v = Number.isFinite(value) ? value : 0;
    return `R$ ${v.toFixed(2).replace(".", ",")}`;
  }
}

function sumQtyFromOrder(order: any): number {
  const items = Array.isArray(order?.items) ? order.items : [];
  const total = items.reduce((acc: number, it: any) => {
    const q = Number(it?.quantity ?? 0);
    return acc + (Number.isFinite(q) ? q : 0);
  }, 0);
  return total > 0 ? total : 0;
}

const ProductCard = memo(function ProductCard({
  item,
  showDivider,
  onPressDetails,
}: {
  item: Product;
  showDivider: boolean;
  onPressDetails: (id: string) => void;
}) {
  const priceLabel = useMemo(() => formatBRL(item.price), [item.price]);

  const goDetails = useCallback(() => {
    onPressDetails(item.id);
  }, [item.id, onPressDetails]);

  return (
    <Pressable onPress={goDetails} style={S.productCard} android_ripple={{}}>
      <View style={{ position: "relative" }}>
        <Image
          source={{
            uri:
              item.imageUrl ||
              "https://picsum.photos/seed/product-placeholder/400/300",
          }}
          style={S.productImage}
        />

        {item.isOutOfStock ? (
          <View style={S.outOfStockPill}>
            <Text style={S.outOfStockText}>ESGOTADO</Text>
          </View>
        ) : null}
      </View>

      <View style={S.productBody}>
        <Text style={S.productName} numberOfLines={2}>
          {item.name}
        </Text>

        <Text style={S.productUnit} numberOfLines={1}>
          {item.unitName}
        </Text>

        <Text style={S.productPrice}>{priceLabel}</Text>

        <View style={S.productFooter}>
          <Pressable onPress={goDetails} style={S.detailsBtn} hitSlop={8}>
            <View style={S.btnCenterRow}>
              <Text style={S.detailsBtnText}>Ver detalhes</Text>
              <FontAwesome
                name="angle-right"
                size={18}
                color={UI.brand.primary}
                style={{ marginLeft: 8 }}
              />
            </View>
          </Pressable>
        </View>
      </View>

      {showDivider ? <View style={S.productDivider} /> : null}
    </Pressable>
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
            color={UI.brand.primary}
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, meLoading } = useAuth();

  const displayName = useMemo(
    () => user?.name || user?.email || "Cliente",
    [user?.name, user?.email],
  );

  const avatarUrl = useMemo(
    () => user?.image || "https://i.pravatar.cc/200?img=12",
    [user?.image],
  );

  const [next, setNext] = useState<NextAppt | null>(null);
  const [nextLoading, setNextLoading] = useState(true);

  const [historyPreview, setHistoryPreview] = useState<HistoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // ✅ sacolinha pendente + badge count
  const [pendingCartOrderId, setPendingCartOrderId] = useState<string | null>(
    null,
  );
  const [pendingCartCount, setPendingCartCount] = useState<number>(0);
  const cartFetchingRef = useRef(false);

  const fetchingRef = useRef(false);
  const fetchingHistoryRef = useRef(false);
  const fetchingProductsRef = useRef(false);

  // ✅ gate da tela (só libera quando TODOS terminarem ao menos 1 vez)
  const didNextRef = useRef(false);
  const didHistoryRef = useRef(false);
  const didProductsRef = useRef(false);
  const didCartRef = useRef(false);
  const [dataReady, setDataReady] = useState(false);

  const recomputeReady = useCallback(() => {
    if (dataReady) return; // já liberou, não precisa recalcular
    const ok =
      didNextRef.current &&
      didHistoryRef.current &&
      didProductsRef.current &&
      didCartRef.current;
    if (ok) setDataReady(true);
  }, [dataReady]);

  const fetchNext = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setNextLoading(true);

      const res = await api.get<{ ok: boolean; next: NextAppt | null }>(
        "/api/mobile/me/appointments/next",
      );

      setNext(res?.next ?? null);
    } catch (err: any) {
      setNext(null);
    } finally {
      setNextLoading(false);
      fetchingRef.current = false;

      didNextRef.current = true;
      recomputeReady();
    }
  }, [recomputeReady]);

  const fetchHistoryPreview = useCallback(async () => {
    if (fetchingHistoryRef.current) return;
    fetchingHistoryRef.current = true;

    try {
      const res = await api.get<{
        ok: boolean;
        items: HistoryItem[];
        _debug?: any;
      }>("/api/mobile/me/history/preview");

      setHistoryPreview(res?.ok && Array.isArray(res?.items) ? res.items : []);
    } catch (err: any) {
      setHistoryPreview([]);
    } finally {
      fetchingHistoryRef.current = false;

      didHistoryRef.current = true;
      recomputeReady();
    }
  }, [recomputeReady]);

  const fetchProductsPreview = useCallback(async () => {
    if (fetchingProductsRef.current) return;
    fetchingProductsRef.current = true;

    try {
      const res = await api.get<{
        ok?: boolean;
        items?: any[];
        products?: any[];
        nextCursor?: string | null;
      }>("/api/mobile/products?limit=4");

      const rawList =
        (Array.isArray(res?.items) ? res.items : null) ??
        (Array.isArray(res?.products) ? res.products : null) ??
        [];

      const mapped: Product[] = rawList
        .slice(0, 4)
        .map((p: any) => ({
          id: String(p?.id ?? ""),
          name: String(p?.name ?? "Produto"),
          price: Number(p?.price ?? 0),
          imageUrl: typeof p?.imageUrl === "string" ? p.imageUrl : null,
          unitName: String(p?.unitName ?? "—"),
          isOutOfStock: !!p?.isOutOfStock,
        }))
        .filter((p) => !!p.id);

      setProducts(mapped);
    } catch (err: any) {
      setProducts([]);
    } finally {
      fetchingProductsRef.current = false;

      didProductsRef.current = true;
      recomputeReady();
    }
  }, [recomputeReady]);

  // ✅ pega sacolinha + soma quantidades (badge)
  const fetchPendingCart = useCallback(async () => {
    if (cartFetchingRef.current) return { id: null as string | null, count: 0 };
    cartFetchingRef.current = true;

    try {
      const res: any = await api.get("/api/mobile/orders?view=bag&limit=1");

      const list = (res?.orders ?? res?.items ?? []) as any[];
      const first = Array.isArray(list) && list.length ? list[0] : null;

      const id = first?.id ? String(first.id) : null;
      const count = first ? sumQtyFromOrder(first) : 0;

      setPendingCartOrderId(id);
      setPendingCartCount(count);

      return { id, count };
    } catch (err: any) {
      setPendingCartOrderId(null);
      setPendingCartCount(0);
      return { id: null as string | null, count: 0 };
    } finally {
      cartFetchingRef.current = false;

      didCartRef.current = true;
      recomputeReady();
    }
  }, [recomputeReady]);

  useFocusEffect(
    useCallback(() => {
      fetchNext();
      fetchHistoryPreview();
      fetchProductsPreview();
      fetchPendingCart();
    }, [
      fetchNext,
      fetchHistoryPreview,
      fetchProductsPreview,
      fetchPendingCart,
    ]),
  );

  const TOP_OFFSET = insets.top + STICKY_ROW_H;

  const headerSpacerStyle = useMemo(
    () => ({ height: TOP_OFFSET, backgroundColor: UI.colors.bg }),
    [TOP_OFFSET],
  );

  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const goToBooking = useCallback(() => {
    router.push("/booking/unit");
  }, [router]);

  const goToHistory = useCallback(() => {
    router.push("/client/history");
  }, [router]);

  const goToProducts = useCallback(() => {
    router.push("/products");
  }, [router]);

  const goToProductDetails = useCallback(
    (id: string) => {
      router.push({ pathname: "/(app)/(tabs)/products/[id]", params: { id } });
    },
    [router],
  );

  const goCart = useCallback(async () => {
    try {
      const currentId = pendingCartOrderId;
      if (currentId) {
        router.push({
          pathname: "/client/cart",
          params: { orderId: currentId },
        });
        return;
      }

      const fresh = await fetchPendingCart();
      if (fresh?.id) {
        router.push({
          pathname: "/client/cart",
          params: { orderId: fresh.id },
        });
        return;
      }

      router.push("/client/cart");
    } catch {
      router.push("/client/cart");
    }
  }, [fetchPendingCart, pendingCartOrderId, router]);

  const onPressReschedule = useCallback(() => {
    if (!next) return;

    router.push({
      pathname: "/booking/unit",
      params: { mode: "edit", appointmentId: next.id },
    });
  }, [next, router]);

  const cancelApiCall = useCallback(
    async (appointmentId: string) => {
      try {
        const res = await api.post<{ ok: boolean; error?: string }>(
          `/api/mobile/me/appointments/${appointmentId}/cancel`,
          {},
        );

        if (!res?.ok) {
          Alert.alert(
            "Não foi possível cancelar",
            res?.error || "Tente novamente.",
          );
          return;
        }

        Alert.alert(
          "Cancelado ✅",
          "Seu agendamento foi cancelado com sucesso.",
        );
        await fetchNext();
        await fetchHistoryPreview();
      } catch (err: any) {
        const msg =
          err?.data?.error ||
          err?.message ||
          "Erro ao cancelar. Tente novamente.";
        Alert.alert("Erro", String(msg));
      }
    },
    [fetchNext, fetchHistoryPreview],
  );

  const onPressCancel = useCallback(() => {
    if (!next) return;

    const feeEligible = !!next.cancellationFeeEligible;
    const notice =
      next.cancellationFeeNotice?.trim() ||
      "Este cancelamento pode ser cobrado em um próximo atendimento, conforme a política do estabelecimento.";

    const message = feeEligible
      ? `${notice}\n\nDeseja cancelar mesmo assim?`
      : "Ao cancelar, este horário ficará livre na agenda.\n\nDeseja cancelar agora?";

    Alert.alert("Cancelar agendamento?", message, [
      { text: "Voltar", style: "cancel" },
      {
        text: "Cancelar",
        style: "destructive",
        onPress: () => cancelApiCall(next.id),
      },
    ]);
  }, [cancelApiCall, next]);

  const keyProduct = useCallback((item: Product) => item.id, []);
  const renderProduct = useCallback(
    ({ item, index }: ListRenderItemInfo<Product>) => (
      <ProductCard
        item={item}
        showDivider={index < products.length - 1}
        onPressDetails={goToProductDetails}
      />
    ),
    [goToProductDetails, products.length],
  );

  const renderHistory = useCallback(
    ({ item, index }: ListRenderItemInfo<HistoryItem>) => (
      <HistoryRow item={item} showDivider={index < historyPreview.length - 1} />
    ),
    [historyPreview.length],
  );

  const Header = useMemo(() => {
    const hasNext = !!next;

    const startsAtInline = hasNext
      ? String(next!.startsAtLabel || "").replace(" • ", " - ")
      : "";

    const isInService =
      hasNext &&
      (String(next!.status || "").toUpperCase() === "IN_SERVICE" ||
        String(next!.status || "").toUpperCase() === "ATENDIMENTO" ||
        String(next!.statusLabel || "").toUpperCase() === "ATENDIMENTO");

    const canReschedule = hasNext ? next!.canReschedule !== false : false;
    const canCancel = hasNext ? next!.canCancel !== false : false;

    const showActions = hasNext && !isInService;

    return (
      <View>
        <View
          pointerEvents="none"
          style={[S.topBounceDark, { height: topBounceHeight }]}
        />

        <View style={headerSpacerStyle} />

        <View style={S.darkShell}>
          <View style={S.darkInner}>
            <View style={S.heroCard}>
              {hasNext ? (
                <>
                  {/* ✅ HERO dividido em 3 partes, com mais espaço entre elas */}
                  <View style={S.heroSections}>
                    {/* 1) Textos: "Seu agendamento..." até o profissional */}
                    <View style={S.heroSection}>
                      <View style={S.heroTitleRow}>
                        <Text style={S.heroTitle} numberOfLines={1}>
                          Seu agendamento - {startsAtInline}
                        </Text>
                      </View>

                      <Text style={S.apptService} numberOfLines={1}>
                        {next!.serviceName} com {next!.barberName}
                      </Text>
                    </View>

                    {/* 2) Unidade + badge */}
                    <View style={S.heroSection}>
                      <View style={S.metaRow}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={S.apptMeta} numberOfLines={1}>
                            {next!.unitName}
                          </Text>
                        </View>

                        <View
                          style={[
                            S.statusPill,
                            isInService ? S.statusPillInService : null,
                          ]}
                        >
                          <FontAwesome
                            name={isInService ? "play" : "check"}
                            size={12}
                            color={UI.colors.black}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={S.statusText}>
                            {isInService ? "ATENDIMENTO" : next!.statusLabel}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* 3) Botões */}
                    {showActions ? (
                      <View style={S.heroSection}>
                        <View style={S.actionsRow}>
                          {canReschedule ? (
                            <Pressable
                              style={S.actionBtn}
                              onPress={onPressReschedule}
                            >
                              <Text style={S.actionText}>Alterar</Text>
                            </Pressable>
                          ) : null}

                          {canCancel ? (
                            <Pressable
                              style={S.actionBtn}
                              onPress={onPressCancel}
                            >
                              <Text style={S.actionText}>Cancelar</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                  </View>
                </>
              ) : (
                <>
                  <Text style={S.emptyApptText}>
                    {nextLoading
                      ? "Carregando seu próximo horário…"
                      : "Reserve agora mesmo o seu horário com a gente!"}
                  </Text>

                  <View style={S.actionsRow}>
                    <Pressable
                      style={S.actionBtn}
                      onPress={goToBooking}
                      disabled={nextLoading}
                    >
                      <Text style={S.actionText}>
                        {nextLoading ? "Aguarde…" : "Novo agendamento"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>

        <View style={S.whiteArea}>
          <View style={S.whiteContent}>
            <Text style={S.sectionTitle}>Produtos</Text>

            {products.length === 0 ? (
              <View style={{ paddingVertical: 10 }}>
                <Text style={S.emptyProductsText}>
                  Nenhum produto disponível no momento.
                </Text>
              </View>
            ) : (
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
            )}

            <Pressable style={S.outlineBtn} onPress={goToProducts}>
              <View style={S.btnCenterRow}>
                <Text style={S.outlineBtnText}>Ver todos os produtos</Text>
                <FontAwesome
                  name="angle-right"
                  size={18}
                  color={UI.brand.primary}
                  style={{ marginLeft: 8 }}
                />
              </View>
            </Pressable>

            <View style={[S.historyHeaderRow, S.sectionTitleSpacing]}>
              <Text style={S.sectionTitle}>Histórico</Text>

              <Pressable style={S.seeMoreBtn} onPress={goToHistory}>
                <Text style={S.seeMoreText}>Ver mais</Text>
                <FontAwesome
                  name="angle-right"
                  size={18}
                  color={UI.brand.primaryText}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }, [
    goToBooking,
    goToHistory,
    goToProducts,
    headerSpacerStyle,
    keyProduct,
    next,
    nextLoading,
    onPressCancel,
    onPressReschedule,
    products.length,
    renderProduct,
    topBounceHeight,
  ]);

  return (
    <ScreenGate dataReady={dataReady} skeleton={<HomeSkeleton />}>
      <View style={S.page}>
        <View style={S.fixedTop}>
          <View
            style={{ height: insets.top, backgroundColor: UI.brand.primary }}
          />

          <View style={S.stickyRow}>
            <View style={S.profileRow}>
              <Image source={{ uri: avatarUrl }} style={S.avatar} />
              <View>
                <Text style={S.hello}>Olá,</Text>
                <Text style={S.name} numberOfLines={1}>
                  {displayName}
                  {meLoading ? "…" : ""}
                </Text>
              </View>
            </View>

            <View style={S.topRightRow}>
              <Pressable style={S.iconBtn} onPress={goCart}>
                <FontAwesome
                  name="shopping-bag"
                  size={18}
                  color={UI.colors.white}
                />

                {pendingCartCount > 0 ? (
                  <View style={S.badge}>
                    <Text style={S.badgeText}>
                      {pendingCartCount > 99 ? "99+" : String(pendingCartCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              <Pressable style={S.iconBtn}>
                <FontAwesome name="bell-o" size={20} color={UI.colors.white} />
              </Pressable>
            </View>
          </View>
        </View>

        <FlatList
          data={historyPreview}
          keyExtractor={(item) => item.id}
          renderItem={renderHistory}
          showsVerticalScrollIndicator={false}
          style={S.list}
          contentContainerStyle={S.listContent}
          ListHeaderComponent={Header}
          ListEmptyComponent={
            <View style={S.emptyHistoryBox}>
              <Text style={S.emptyHistoryText}>
                Você ainda não tem histórico por aqui.
              </Text>
            </View>
          }
          removeClippedSubviews
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
        />
      </View>
    </ScreenGate>
  );
}

const S = StyleSheet.create({
  page: { flex: 1, backgroundColor: UI.colors.bg },
  fixedTop: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 999 },

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
  hello: { color: UI.colors.textMuted, fontSize: 12, fontWeight: "700" },
  name: { color: UI.colors.text, fontSize: 16, fontWeight: "700" },

  topRightRow: { flexDirection: "row", gap: 10, alignItems: "center" },

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

  // ✅ badge mais pra direita e mais pra cima (alinhamento topo)
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: UI.brand.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: UI.colors.bg,
  },

  badgeText: {
    color: UI.colors.white,
    fontSize: 11,
    fontWeight: "900",
    includeFontPadding: false,
    textAlignVertical: "center",
  },

  list: { flex: 1, backgroundColor: UI.colors.white },
  listContent: { paddingBottom: 24 },

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

  // ✅ novo: espaçamento maior entre as 3 partes do card hero
  heroSections: {
    gap: 25, // ajuste aqui se quiser mais/menos espaço (ex: 20, 24)
  },
  heroSection: {},

  heroTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },

  heroTitle: { color: UI.colors.text, fontSize: 16, fontWeight: "600" },

  // ✅ removi o marginTop daqui pra não “somar” com o gap do heroSections
  apptService: {
    color: UI.colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
  },

  apptMeta: { color: UI.colors.textDim, fontSize: 16, marginTop: 2 },

  // ✅ removi marginTop, o espaçamento agora vem do heroSections
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
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

  statusPillInService: { backgroundColor: "rgba(255,193,7,0.95)" },
  statusText: { color: UI.colors.black, fontSize: 12, fontWeight: "700" },

  // ✅ removi marginTop, o espaçamento agora vem do heroSections
  actionsRow: { flexDirection: "row", gap: 10 },
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

  emptyApptText: {
    marginTop: 6,
    color: UI.colors.text,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    textAlign: "center",
  },

  whiteArea: { backgroundColor: UI.colors.white },
  whiteContent: { paddingHorizontal: UI.spacing.screenX, paddingTop: 18 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: UI.brand.primaryText,
  },

  sectionTitleSpacing: { marginTop: 28 },

  historyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  seeMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  seeMoreText: {
    color: UI.brand.primaryText,
    fontSize: 13,
    fontWeight: "700",
  },

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

  outOfStockPill: {
    position: "absolute",
    right: 10,
    top: 10,
    backgroundColor: UI.brand.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  outOfStockText: {
    color: UI.colors.white,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  productBody: {
    flex: 1,
    minHeight: 128,
  },

  productName: {
    fontSize: 16,
    fontWeight: "600",
    color: UI.brand.primaryText,
  },

  productUnit: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(0,0,0,0.55)",
  },

  productPrice: {
    fontSize: 20,
    fontWeight: "700",
    color: UI.brand.primaryText,
    marginTop: 6,
  },

  productFooter: {
    marginTop: 10,
    flex: 1,
    justifyContent: "flex-end",
  },

  btnCenterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  detailsBtn: {
    height: 40,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: UI.colors.white,
    borderWidth: 1,
    borderColor: UI.brand.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  detailsBtnText: {
    color: UI.brand.primary,
    fontSize: 13,
    fontWeight: "500",
  },

  productDivider: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(0,0,0,0.10)",
  },

  emptyProductsText: {
    color: "rgba(0,0,0,0.55)",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 10,
  },

  outlineBtn: {
    marginTop: 18,
    height: 40,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: UI.colors.white,
    borderWidth: 1,
    borderColor: UI.brand.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  outlineBtnText: {
    color: UI.brand.primary,
    fontSize: 14,
    fontWeight: "500",
  },

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
    backgroundColor: "rgba(124,108,255,0.18)",
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

  emptyHistoryBox: {
    paddingHorizontal: UI.spacing.screenX,
    paddingVertical: 18,
    alignItems: "center",
    gap: 10,
  },

  emptyHistoryText: {
    color: "rgba(0,0,0,0.55)",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
