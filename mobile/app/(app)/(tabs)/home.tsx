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

type ProductBadge =
  | { type: "BIRTHDAY"; label: string }
  | { type: "LEVEL"; label: string }
  | null;

type Product = {
  id: string;
  name: string;

  // ✅ compat: preço final continua existindo (mas UI usa base/final)
  price: number;

  // ✅ novo motor de preço
  basePrice?: number;
  finalPrice?: number;
  hasDiscount?: boolean;
  badge?: ProductBadge;

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

type PendingReviewResponse = {
  ok: boolean;
  pending?: null | {
    appointmentId: string;
    scheduleAt: string;
    barberName: string;
    serviceName: string;
  };
  pendings?: Array<{
    appointmentId: string;
    scheduleAt: string;
    barberName: string;
    serviceName: string;
  }>;
  tags?: { id: string; label: string }[];
  error?: string;
};

// -----------------------------
// 💰 dinheiro: sem “,00” quando inteiro
// -----------------------------
function formatMoneySmartBRL(value: number) {
  const v = Number(value ?? 0);
  const safe = Number.isFinite(v) ? v : 0;

  const isInt = Math.abs(safe - Math.round(safe)) < 1e-9;

  try {
    return safe.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: isInt ? 0 : 2,
      maximumFractionDigits: isInt ? 0 : 2,
    });
  } catch {
    const fixed = isInt ? String(Math.round(safe)) : safe.toFixed(2);
    return `R$ ${fixed.replace(".", ",")}`;
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

function safeNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// =======================
// 🎨 NÍVEL DO CLIENTE (cores copiadas do Admin)
// =======================
type CustomerLevelKey = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

function normalizeCustomerLevelKey(user: any): CustomerLevelKey | null {
  const raw = String(
    user?.customerLevel?.key ??
      user?.customerLevel?.level ??
      user?.customerLevel?.value ??
      user?.customerLevel ??
      user?.level?.key ??
      user?.level?.value ??
      user?.level ??
      user?.levelKey ??
      user?.levelEnum ??
      "",
  ).trim();

  if (
    raw === "BRONZE" ||
    raw === "PRATA" ||
    raw === "OURO" ||
    raw === "DIAMANTE"
  )
    return raw;

  const label = String(
    user?.customerLevel?.label ??
      user?.level?.label ??
      user?.levelLabel ??
      user?.tier?.label ??
      user?.tier ??
      "",
  )
    .trim()
    .toLowerCase();

  if (label.includes("bronze")) return "BRONZE";
  if (label.includes("prata")) return "PRATA";
  if (label.includes("ouro")) return "OURO";
  if (label.includes("diam")) return "DIAMANTE";

  return null;
}

function levelChipColors(level: CustomerLevelKey) {
  switch (level) {
    case "BRONZE":
      return {
        bg: "rgba(245, 158, 11, 0.10)", // amber-500/10
        border: "rgba(245, 158, 11, 0.30)", // amber-500/30
        text: "rgb(180, 83, 9)", // amber-700
      };
    case "PRATA":
      return {
        bg: "rgba(100, 116, 139, 0.10)", // slate-500/10
        border: "rgba(100, 116, 139, 0.30)", // slate-500/30
        text: "rgb(226, 232, 240)", // slate-200
      };
    case "OURO":
      return {
        bg: "rgba(234, 179, 8, 0.10)", // yellow-500/10
        border: "rgba(234, 179, 8, 0.30)", // yellow-500/30
        text: "rgb(161, 98, 7)", // yellow-700 (aprox)
      };
    case "DIAMANTE":
      return {
        bg: "rgba(14, 165, 233, 0.10)", // sky-500/10
        border: "rgba(14, 165, 233, 0.30)", // sky-500/30
        text: "rgb(3, 105, 161)", // sky-700
      };
  }
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
  const goDetails = useCallback(() => {
    onPressDetails(item.id);
  }, [item.id, onPressDetails]);

  // ✅ decide quais valores usar + calcula economia%
  const pricing = useMemo(() => {
    const base = safeNumber(item.basePrice, NaN);
    const final = safeNumber(item.finalPrice, NaN);

    const hasBase = Number.isFinite(base);
    const hasFinal = Number.isFinite(final);

    // se vier do endpoint: usa (base/final)
    if (hasBase && hasFinal) {
      const hasDiscount = !!item.hasDiscount && final < base;

      const economyPct =
        hasDiscount && base > 0 ? Math.round(((base - final) / base) * 100) : 0;

      return {
        base,
        final,
        hasDiscount,
        economyPct,
      };
    }

    // fallback: só "price"
    const p = safeNumber(item.price, 0);
    return {
      base: p,
      final: p,
      hasDiscount: false,
      economyPct: 0,
    };
  }, [item.basePrice, item.finalPrice, item.hasDiscount, item.price]);

  const baseLabel = useMemo(
    () => formatMoneySmartBRL(pricing.base),
    [pricing.base],
  );
  const finalLabel = useMemo(
    () => formatMoneySmartBRL(pricing.final),
    [pricing.final],
  );

  const economyPctLabel = useMemo(() => {
    const v = Number(pricing.economyPct ?? 0);
    if (!Number.isFinite(v) || v <= 0) return null;
    return `${Math.max(0, Math.min(99, Math.round(v)))}%`;
  }, [pricing.economyPct]);

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
          fadeDuration={0}
        />

        {/* ✅ badge: ANIVERSÁRIO NÃO APARECE AQUI (só no topo). Mantém LEVEL */}
        {item.badge?.label ? (
          <View style={[S.badgePill]}>
            <Text style={S.badgePillText} numberOfLines={1}>
              {item.badge.label}
            </Text>
          </View>
        ) : null}

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

        {/* ✅ regra do preço (De/Por/Economia) */}
        {pricing.hasDiscount ? (
          <View style={S.priceStack}>
            <Text style={S.basePriceStriked} numberOfLines={1}>
              De: {baseLabel}
            </Text>

            <Text style={S.finalPrice} numberOfLines={1}>
              Por: {finalLabel}
            </Text>

            {economyPctLabel ? (
              <Text style={S.economyText} numberOfLines={1}>
                Economia: {economyPctLabel}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={S.productPrice} numberOfLines={1}>
            {finalLabel}
          </Text>
        )}

        <View style={S.productFooter}>
          <Pressable onPress={goDetails} style={S.detailsBtn} hitSlop={8}>
            <View style={S.btnCenterRow}>
              <Text style={S.detailsBtnText}>Ver detalhes</Text>
              <FontAwesome
                name="angle-right"
                size={18}
                color="#141414"
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

  // ✅ nível do cliente (label curta)
  const userLevelLabel = useMemo(() => {
    const raw =
      (user as any)?.level?.label ??
      (user as any)?.levelLabel ??
      (user as any)?.level ??
      (user as any)?.customerLevel?.label ??
      (user as any)?.customerLevel ??
      (user as any)?.tier?.label ??
      (user as any)?.tier ??
      null;

    const s = String(raw ?? "").trim();
    if (!s) return null;

    // corta pra não virar textão em cima do header
    return s.length > 12 ? `${s.slice(0, 12)}…` : s;
  }, [user]);

  // ✅ ícone por nível (mantém o mesmo que você já tinha)
  const userLevelIcon = useMemo(() => {
    const l = String(userLevelLabel ?? "").toLowerCase();
    if (l.includes("diam")) return "diamond";
    if (l.includes("ouro")) return "trophy";
    if (l.includes("prata")) return "certificate";
    return "star";
  }, [userLevelLabel]);

  // ✅ cores copiadas do Admin (bg/text/border)
  const userLevelKey = useMemo(() => normalizeCustomerLevelKey(user), [user]);

  const userLevelStyle = useMemo(() => {
    if (!userLevelKey) return null;
    const c = levelChipColors(userLevelKey);

    return {
      container: {
        backgroundColor: c.bg,
        borderColor: c.border,
      },
      text: {
        color: c.text,
      },
      icon: {
        color: c.text,
      },
    } as const;
  }, [userLevelKey]);

  const [next, setNext] = useState<NextAppt | null>(null);
  const [nextLoading, setNextLoading] = useState(true);

  const [historyPreview, setHistoryPreview] = useState<HistoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [pendingCartOrderId, setPendingCartOrderId] = useState<string | null>(
    null,
  );
  const [pendingCartCount, setPendingCartCount] = useState<number>(0);
  const cartFetchingRef = useRef(false);

  const [pendingReviewCount, setPendingReviewCount] = useState<number>(0);
  const reviewFetchingRef = useRef(false);

  // ✅ aniversário (apenas 1x no topo)
  const [birthdayBadgeLabel, setBirthdayBadgeLabel] = useState<string | null>(
    null,
  );

  const fetchingRef = useRef(false);
  const fetchingHistoryRef = useRef(false);
  const fetchingProductsRef = useRef(false);

  const didNextRef = useRef(false);
  const didHistoryRef = useRef(false);
  const didProductsRef = useRef(false);
  const didCartRef = useRef(false);
  const didReviewRef = useRef(false);
  const [dataReady, setDataReady] = useState(false);

  const recomputeReady = useCallback(() => {
    if (dataReady) return;
    const ok =
      didNextRef.current &&
      didHistoryRef.current &&
      didProductsRef.current &&
      didCartRef.current &&
      didReviewRef.current;
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

      // ✅ pega 1 label de aniversário (se vier), mas NÃO mostra nos cards
      const birthdayFromApi = rawList.find(
        (p: any) =>
          p?.badge?.type === "BIRTHDAY" && String(p?.badge?.label ?? ""),
      ) as any;

      const birthdayLabel = birthdayFromApi?.badge?.label
        ? String(birthdayFromApi.badge.label).trim()
        : null;

      setBirthdayBadgeLabel(birthdayLabel || null);

      const mapped: Product[] = rawList
        .slice(0, 4)
        .map((p: any) => {
          const basePrice = safeNumber(p?.basePrice, NaN);
          const finalPrice = safeNumber(p?.finalPrice, NaN);
          const hasDiscount =
            !!p?.hasDiscount &&
            Number.isFinite(basePrice) &&
            Number.isFinite(finalPrice) &&
            finalPrice < basePrice;

          const rawBadge: ProductBadge =
            p?.badge && typeof p.badge === "object"
              ? {
                  type: p.badge.type === "BIRTHDAY" ? "BIRTHDAY" : "LEVEL",
                  label: String(p.badge.label ?? "").trim(),
                }
              : null;

          // ✅ regra: BIRTHDAY não vai pro card
          const badge: ProductBadge =
            rawBadge?.type === "BIRTHDAY" ? null : rawBadge;

          const final = Number.isFinite(finalPrice)
            ? finalPrice
            : safeNumber(p?.price, 0);

          return {
            id: String(p?.id ?? ""),
            name: String(p?.name ?? "Produto"),
            price: final,
            basePrice: Number.isFinite(basePrice) ? basePrice : undefined,
            finalPrice: Number.isFinite(finalPrice) ? finalPrice : undefined,
            hasDiscount,
            badge: badge?.label ? badge : null,
            imageUrl: typeof p?.imageUrl === "string" ? p.imageUrl : null,
            unitName: String(p?.unitName ?? "—"),
            isOutOfStock: !!p?.isOutOfStock,
          };
        })
        .filter((p) => !!p.id);

      setProducts(mapped);
    } catch (err: any) {
      setProducts([]);
      setBirthdayBadgeLabel(null);
    } finally {
      fetchingProductsRef.current = false;

      didProductsRef.current = true;
      recomputeReady();
    }
  }, [recomputeReady]);

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

  const fetchPendingReviewCount = useCallback(async () => {
    if (reviewFetchingRef.current) return 0;
    reviewFetchingRef.current = true;

    try {
      const res = await api.get<PendingReviewResponse>(
        "/api/mobile/reviews/pending",
      );

      const listCount =
        res?.ok && Array.isArray(res?.pendings) ? res.pendings.length : 0;

      const singleCount = res?.ok && res?.pending?.appointmentId ? 1 : 0;

      const count = listCount > 0 ? listCount : singleCount;

      setPendingReviewCount(count);
      return count;
    } catch {
      setPendingReviewCount(0);
      return 0;
    } finally {
      reviewFetchingRef.current = false;

      didReviewRef.current = true;
      recomputeReady();
    }
  }, [recomputeReady]);

  useFocusEffect(
    useCallback(() => {
      fetchNext();
      fetchHistoryPreview();
      fetchProductsPreview();
      fetchPendingCart();
      fetchPendingReviewCount();
    }, [
      fetchNext,
      fetchHistoryPreview,
      fetchProductsPreview,
      fetchPendingCart,
      fetchPendingReviewCount,
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

  const goNotifications = useCallback(() => {
    router.push("/client/notifications");
  }, [router]);

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
                  <View style={S.heroSections}>
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
                <View style={S.emptyApptBox}>
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
                </View>
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

            <Pressable style={S.allProductsBtn} onPress={goToProducts}>
              <View style={S.btnCenterRow}>
                <Text style={S.allProductsBtnText}>Ver todos os produtos</Text>
                <FontAwesome
                  name="angle-right"
                  size={18}
                  color="#FFFFFF"
                  style={{ marginLeft: 8 }}
                />
              </View>
            </Pressable>

            <View style={[S.historyHeaderRow, S.sectionTitleSpacing]}>
              <Text style={S.historyTitleInline}>Histórico</Text>

              <Pressable style={S.allProductsBtnSmall} onPress={goToHistory}>
                <View style={S.btnCenterRow}>
                  <Text style={S.allProductsBtnText}>Ver mais</Text>
                  <FontAwesome
                    name="angle-right"
                    size={18}
                    color="#FFFFFF"
                    style={{ marginLeft: 8 }}
                  />
                </View>
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

  const onPressBirthday = useCallback(() => {
    if (!birthdayBadgeLabel) return;
    Alert.alert(
      "Parabéns pra você! 🎂 \nAproveite os descontos especiais para aniversariantes.",
    );
  }, [birthdayBadgeLabel]);

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
              {/* ✅ aniversário: só aqui, à esquerda do nível (padrão dos ícones) */}
              {birthdayBadgeLabel ? (
                <Pressable
                  style={S.iconBtn}
                  onPress={onPressBirthday}
                  hitSlop={8}
                >
                  <FontAwesome
                    name="birthday-cake"
                    size={18}
                    color={UI.colors.white}
                  />
                  <View style={S.birthdayDot}>
                    <Text style={S.birthdayDotText}>!</Text>
                  </View>
                </Pressable>
              ) : null}

              {/* ⭐ Nível do cliente (à esquerda da sacolinha) */}
              {userLevelLabel ? (
                <Pressable
                  style={[S.iconBtn, S.levelBtn, userLevelStyle?.container]}
                  onPress={() => {}}
                  hitSlop={8}
                >
                  <FontAwesome
                    name={userLevelIcon as any}
                    size={18}
                    color={userLevelStyle?.icon?.color ?? UI.colors.white}
                  />
                  <Text
                    style={[S.levelMiniText, userLevelStyle?.text]}
                    numberOfLines={1}
                  >
                    {userLevelLabel}
                  </Text>
                </Pressable>
              ) : null}

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

              <Pressable style={S.iconBtn} onPress={goNotifications}>
                <FontAwesome name="bell-o" size={20} color={UI.colors.white} />

                {pendingReviewCount > 0 ? (
                  <View style={S.badge}>
                    <Text style={S.badgeText}>
                      {pendingReviewCount > 99
                        ? "99+"
                        : String(pendingReviewCount)}
                    </Text>
                  </View>
                ) : null}
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

  // ⭐ botão de nível (mesma base do iconBtn, só adiciona mini label)
  levelBtn: {
    paddingTop: 7,
  },
  levelMiniText: {
    marginTop: 2,
    fontSize: 9.5,
    fontWeight: "900",
    color: UI.colors.white,
    includeFontPadding: false,
    textAlign: "center",
    maxWidth: 38,
  },

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

  // ✅ bolinha do aniversário (sutil, mesma pegada do badge)
  birthdayDot: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: "rgba(124,108,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: UI.colors.bg,
  },
  birthdayDotText: {
    color: "#FFFFFF",
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

  heroSections: { gap: 25 },
  heroSection: {},

  heroTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },

  heroTitle: { color: UI.colors.text, fontSize: 16, fontWeight: "600" },

  apptService: {
    color: UI.colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
  },

  apptMeta: { color: UI.colors.textDim, fontSize: 16, marginTop: 2 },

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

  emptyApptBox: {
    padding: 5,
    gap: 14,
  },

  emptyApptText: {
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

  historyTitleInline: {
    fontSize: 18,
    fontWeight: "600",
    color: UI.brand.primaryText,
    marginBottom: 0,
  },

  sectionTitleSpacing: { marginTop: 28 },

  historyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
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

  // ⭐ (LEVEL only)
  badgePill: {
    position: "absolute",
    left: 10,
    top: 10,
    maxWidth: 175,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(20,20,20,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  badgePillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
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

  // ✅ stack do preço quando tem desconto
  priceStack: {
    marginTop: 6,
    gap: 2,
  },

  basePriceStriked: {
    fontSize: 13,
    fontWeight: "800",
    color: "rgba(0,0,0,0.48)",
    textDecorationLine: "line-through",
  },

  finalPrice: {
    fontSize: 16,
    fontWeight: "900",
    color: UI.brand.primaryText,
  },

  // ✅ nova linha: Economia: X%
  economyText: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "900",
    color: "rgba(0,0,0,0.58)",
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
    borderColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
  },

  detailsBtnText: {
    color: "#141414",
    fontSize: 13,
    fontWeight: "600",
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

  allProductsBtn: {
    marginTop: 18,
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
  },

  allProductsBtnSmall: {
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
  },

  allProductsBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
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
