import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  FlatList,
  ListRenderItemInfo,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { UI, styles } from "../../../../src/theme/client-theme";
import { useAuth } from "../../../../src/auth/auth-context";
import { api } from "../../../../src/services/api";

import { ScreenGate } from "../../../../src/components/layout/ScreenGate";
import { ProductsSkeleton } from "../../../../src/components/loading/ProductsSkeleton";

const STICKY_ROW_H = 74;

type Category = { id: string; label: string };

type ProductBadge =
  | { type: "BIRTHDAY"; label: string }
  | { type: "LEVEL"; label: string }
  | null;

type ApiProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  description: string;
  category: string | null;
  stockQuantity: number;
  isOutOfStock: boolean;
  pickupDeadlineDays: number;
  unitId: string;
  unitName: string;

  // ✅ motor de preço
  price: number; // preço final (compat)
  basePrice?: number;
  finalPrice?: number;
  hasDiscount?: boolean;
  badge?: ProductBadge;
};

type Product = {
  id: string;
  name: string;

  // ✅ agora numérico
  price: number;
  basePrice?: number;
  finalPrice?: number;
  hasDiscount?: boolean;
  badge?: ProductBadge;

  image: string;
  isOutOfStock: boolean;
  category: string | null;
};

type PendingReviewResponse = {
  ok: boolean;
  pendings?: Array<{
    appointmentId: string;
    scheduleAt: string;
    barberName: string;
    serviceName: string;
  }>;
  pending?: null | {
    appointmentId: string;
    scheduleAt: string;
    barberName: string;
    serviceName: string;
  };
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

function safeNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sumQtyFromOrder(order: any): number {
  const items = Array.isArray(order?.items) ? order.items : [];
  const total = items.reduce((acc: number, it: any) => {
    const q = Number(it?.quantity ?? 0);
    return acc + (Number.isFinite(q) ? q : 0);
  }, 0);
  return total > 0 ? total : 0;
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

type ProductsHeaderProps = {
  topBounceHeight: number;
  topOffset: number;
  categories: Category[];
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
  search: string;
  onChangeSearch: (v: string) => void;
  loading: boolean;
  totalCount: number;
};

const CategoryChip = memo(function CategoryChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[S.chip, active ? S.chipActive : null]}>
      <Text style={[S.chipText, active ? S.chipTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
});

const ProductTile = memo(function ProductTile({
  item,
  onOpen,
  onReserve,
  reserving,
}: {
  item: Product;
  onOpen: (id: string) => void;
  onReserve: (id: string) => void;
  reserving: boolean;
}) {
  const pricing = useMemo(() => {
    const base = safeNumber(item.basePrice, NaN);
    const final = safeNumber(item.finalPrice, NaN);

    if (Number.isFinite(base) && Number.isFinite(final)) {
      const hasDiscount = !!item.hasDiscount && final < base;
      return { base, final, hasDiscount };
    }

    const p = safeNumber(item.price, 0);
    return { base: p, final: p, hasDiscount: false };
  }, [item.basePrice, item.finalPrice, item.hasDiscount, item.price]);

  const baseLabel = useMemo(
    () => formatMoneySmartBRL(pricing.base),
    [pricing.base],
  );
  const finalLabel = useMemo(
    () => formatMoneySmartBRL(pricing.final),
    [pricing.final],
  );

  return (
    <Pressable style={S.productCard} onPress={() => onOpen(item.id)}>
      <View style={S.productImgWrap}>
        <Image source={{ uri: item.image }} style={S.productImage} />

        {/* 🎂 / ⭐ */}
        {item.badge?.label ? (
          <View
            style={[
              S.badgePill,
              item.badge.type === "BIRTHDAY" ? S.badgePillBirthday : null,
            ]}
          >
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

      <Text numberOfLines={2} style={S.productName}>
        {item.name}
      </Text>

      {/* ✅ regra do preço */}
      {pricing.hasDiscount ? (
        <View style={S.priceStack}>
          <Text style={S.productOldPriceBig} numberOfLines={1}>
            {baseLabel}
          </Text>
          <Text style={S.productPrice} numberOfLines={1}>
            {finalLabel}
          </Text>
        </View>
      ) : (
        <View style={S.priceRow}>
          <Text style={S.productPrice} numberOfLines={1}>
            {finalLabel}
          </Text>
        </View>
      )}

      <View style={S.tileFooter}>
        {item.isOutOfStock ? (
          <Pressable
            onPress={() => onOpen(item.id)}
            style={S.detailsBtn}
            hitSlop={8}
          >
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
        ) : (
          <Pressable
            onPress={() => onReserve(item.id)}
            disabled={reserving}
            style={[S.reserveBtn, reserving ? S.reserveBtnDisabled : null]}
          >
            {reserving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <FontAwesome name="shopping-bag" size={14} color="#FFFFFF" />
            )}
            <Text style={S.reserveBtnText}>
              {reserving ? "Reservando…" : "Reservar"}
            </Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
});

const ProductsHeader = memo(function ProductsHeader({
  topBounceHeight,
  topOffset,
  categories,
  activeCategoryId,
  onSelectCategory,
  search,
  onChangeSearch,
  loading,
  totalCount,
}: ProductsHeaderProps) {
  return (
    <View>
      <View
        pointerEvents="none"
        style={[S.topBounceDark, { height: topBounceHeight }]}
      />

      <View style={{ height: topOffset, backgroundColor: UI.colors.bg }} />

      <View style={S.darkShell}>
        <View style={S.darkInner}>
          <View style={[styles.glassCard, S.filtersCard]}>
            <View style={S.searchRow}>
              <View style={S.searchIcon}>
                <FontAwesome name="search" size={16} color={UI.colors.white} />
              </View>

              <TextInput
                placeholder="Buscar por nome…"
                placeholderTextColor="rgba(255,255,255,0.55)"
                style={S.searchInput}
                value={search}
                onChangeText={onChangeSearch}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />

              {loading ? (
                <View style={{ width: 22, alignItems: "flex-end" }}>
                  <ActivityIndicator />
                </View>
              ) : null}
            </View>

            <FlatList
              data={categories}
              keyExtractor={(c) => c.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={S.chipsContent}
              renderItem={({ item }: ListRenderItemInfo<Category>) => (
                <CategoryChip
                  label={item.label}
                  active={item.id === activeCategoryId}
                  onPress={() => onSelectCategory(item.id)}
                />
              )}
              removeClippedSubviews
              initialNumToRender={6}
              maxToRenderPerBatch={8}
              windowSize={5}
            />
          </View>

          <View style={S.heroCard}>
            <View style={S.heroRow}>
              <View style={S.heroLeft}>
                <Text style={S.heroKicker}>Destaque da semana</Text>
                <Text style={S.heroTitle}>Kit Barba Completo</Text>
                <Text style={S.heroSub}>
                  Óleo + balm + pente. Tudo no jeito pra ficar alinhado.
                </Text>

                <Pressable style={S.heroBtn}>
                  <Text style={S.heroBtnText}>Ver kit</Text>
                  <FontAwesome
                    name="arrow-right"
                    size={14}
                    color={UI.colors.white}
                  />
                </Pressable>
              </View>

              <View style={S.heroThumb}>
                <FontAwesome
                  name="shopping-bag"
                  size={26}
                  color={UI.colors.white}
                />
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={S.whiteArea}>
        <View style={S.whiteContent}>
          <View style={S.sectionRow}>
            <Text style={S.sectionTitle}>Catálogo</Text>
            <Text style={S.sectionMeta}>
              {loading ? "Carregando…" : `${totalCount} produto(s)`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const ProductsFooter = memo(function ProductsFooter({
  onGoCart,
}: {
  onGoCart: () => void;
}) {
  return (
    <View style={S.footerWrap}>
      <View style={S.bottomCTA}>
        <Pressable style={S.goCartBtn} onPress={onGoCart}>
          <View style={S.btnCenterRow}>
            <Text style={S.goCartBtnText}>Ir para o carrinho</Text>
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
  );
});

export default function Products() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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

    return s.length > 12 ? `${s.slice(0, 12)}…` : s;
  }, [user]);

  const userLevelIcon = useMemo(() => {
    const l = String(userLevelLabel ?? "").toLowerCase();
    if (l.includes("diam")) return "diamond";
    if (l.includes("ouro")) return "trophy";
    if (l.includes("prata")) return "certificate";
    return "star";
  }, [userLevelLabel]);

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

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [reservingId, setReservingId] = useState<string | null>(null);

  const [pendingCartOrderId, setPendingCartOrderId] = useState<string | null>(
    null,
  );
  const [pendingCartCount, setPendingCartCount] = useState<number>(0);

  const [pendingReviewAppointmentId, setPendingReviewAppointmentId] = useState<
    string | null
  >(null);
  const [pendingReviewCount, setPendingReviewCount] = useState<number>(0);

  const fetchingRef = useRef(false);
  const cartFetchingRef = useRef(false);
  const reviewFetchingRef = useRef(false);

  const didProductsRef = useRef(false);
  const didCartRef = useRef(false);
  const didReviewRef = useRef(false);
  const [dataReady, setDataReady] = useState(false);

  const recomputeReady = useCallback(() => {
    if (dataReady) return;
    if (didProductsRef.current && didCartRef.current && didReviewRef.current) {
      setDataReady(true);
    }
  }, [dataReady]);

  const TOP_OFFSET = insets.top + STICKY_ROW_H;

  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );

  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const openProduct = useCallback(
    (id: string) => {
      router.push({ pathname: "/(app)/(tabs)/products/[id]", params: { id } });
    },
    [router],
  );

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
      console.log(
        "[products] fetchPendingCart error:",
        err?.data ?? err?.message ?? err,
      );
      setPendingCartOrderId(null);
      setPendingCartCount(0);
      return { id: null as string | null, count: 0 };
    } finally {
      cartFetchingRef.current = false;

      didCartRef.current = true;
      recomputeReady();
    }
  }, [recomputeReady]);

  const fetchPendingReview = useCallback(async () => {
    if (reviewFetchingRef.current)
      return { id: null as string | null, count: 0 };
    reviewFetchingRef.current = true;

    try {
      const res = await api.get<PendingReviewResponse>(
        "/api/mobile/reviews/pending",
      );

      const list = Array.isArray(res?.pendings) ? res.pendings : [];

      const pendingIdFromList =
        list.length > 0 && list[0]?.appointmentId
          ? String(list[0].appointmentId)
          : null;

      const pendingIdFromSingle =
        res?.ok && res?.pending?.appointmentId
          ? String(res.pending.appointmentId)
          : null;

      const id = pendingIdFromList ?? pendingIdFromSingle;
      const count = list.length > 0 ? list.length : id ? 1 : 0;

      setPendingReviewAppointmentId(id);
      setPendingReviewCount(count);

      return { id, count };
    } catch (err: any) {
      console.log(
        "[products] fetchPendingReview error:",
        err?.data ?? err?.message ?? err,
      );
      setPendingReviewAppointmentId(null);
      setPendingReviewCount(0);
      return { id: null as string | null, count: 0 };
    } finally {
      reviewFetchingRef.current = false;

      didReviewRef.current = true;
      recomputeReady();
    }
  }, [recomputeReady]);

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

  const reserveProduct = useCallback(
    async (productId: string) => {
      if (!productId) return;
      if (reservingId) return;

      try {
        setReservingId(productId);

        const res = await api.post<{
          ok: boolean;
          orderId?: string;
          reservedUntil?: string;
        }>("/api/mobile/orders", { productId, quantity: 1 });

        const orderId = res?.orderId;

        if (!res?.ok || !orderId) throw new Error("invalid_response");

        setPendingCartOrderId(String(orderId));
        await fetchPendingCart();

        router.push({ pathname: "/client/cart", params: { orderId } });
      } catch (err) {
        console.log("[reserve] error:", err);
        Alert.alert(
          "Erro",
          "Não foi possível reservar agora. Tente novamente.",
        );
      } finally {
        setReservingId(null);
      }
    },
    [fetchPendingCart, reservingId, router],
  );

  const fetchAllProducts = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setLoading(true);

      const all: ApiProduct[] = [];
      let cursor: string | null = null;

      const MAX = 300;

      while (true) {
        const url: string =
          "/api/mobile/products" +
          `?limit=50` +
          (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");

        const res = (await api.get(url)) as {
          items?: ApiProduct[];
          nextCursor?: string | null;
        };

        const page: ApiProduct[] = Array.isArray(res?.items) ? res.items : [];
        all.push(...page);

        cursor = (res as any)?.nextCursor ?? null;

        if (!cursor) break;
        if (all.length >= MAX) break;
      }

      const mapped: Product[] = all
        .map((p) => {
          const image: string =
            p.imageUrl ||
            "https://picsum.photos/seed/product-placeholder/600/420";

          const basePrice = safeNumber((p as any)?.basePrice, NaN);
          const finalPrice = safeNumber((p as any)?.finalPrice, NaN);

          const hasDiscount =
            !!(p as any)?.hasDiscount &&
            Number.isFinite(basePrice) &&
            Number.isFinite(finalPrice) &&
            finalPrice < basePrice;

          const badge: ProductBadge =
            (p as any)?.badge && typeof (p as any).badge === "object"
              ? {
                  type:
                    (p as any).badge.type === "BIRTHDAY" ? "BIRTHDAY" : "LEVEL",
                  label: String((p as any).badge.label ?? "").trim(),
                }
              : null;

          const final = Number.isFinite(finalPrice)
            ? finalPrice
            : safeNumber(p.price, 0);

          return {
            id: String(p.id),
            name: String(p.name ?? "Produto"),

            price: final,
            basePrice: Number.isFinite(basePrice) ? basePrice : undefined,
            finalPrice: Number.isFinite(finalPrice) ? finalPrice : undefined,
            hasDiscount,
            badge: badge?.label ? badge : null,

            image,
            isOutOfStock: !!p.isOutOfStock,
            category: p.category ? String(p.category) : null,
          };
        })
        .filter((p) => !!p.id);

      setProducts(mapped);

      const activeExists =
        activeCategory === "all" ||
        mapped.some(
          (p) =>
            (p.category || "").trim().toLowerCase() ===
            activeCategory.toLowerCase(),
        );
      if (!activeExists) setActiveCategory("all");
    } catch (err: any) {
      console.log("[products] fetch error:", err?.data ?? err?.message ?? err);
      const msg =
        err?.data?.error ||
        err?.message ||
        "Não foi possível carregar os produtos.";
      Alert.alert("Erro", String(msg));
      setProducts([]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;

      didProductsRef.current = true;
      recomputeReady();
    }
  }, [activeCategory, recomputeReady]);

  useFocusEffect(
    useCallback(() => {
      fetchAllProducts();
      fetchPendingCart();
      fetchPendingReview();
    }, [fetchAllProducts, fetchPendingCart, fetchPendingReview]),
  );

  const categories = useMemo<Category[]>(() => {
    const normalize = (s: string) => s.trim().toLowerCase();

    const uniq = Array.from(
      new Set(
        products
          .map((p) => (p.category || "").trim())
          .filter((c) => !!c)
          .map(normalize),
      ),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

    const prettify = (s: string) =>
      s
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

    return [{ id: "all", label: "Todos" }].concat(
      uniq.map((c) => ({ id: c, label: prettify(c) })),
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products.filter((p) => {
      const nameOk = !q || p.name.toLowerCase().includes(q);

      const cat = (p.category || "").trim().toLowerCase();
      const categoryOk =
        activeCategory === "all" || (cat && cat === activeCategory);

      return nameOk && categoryOk;
    });
  }, [products, search, activeCategory]);

  const keyProduct = useCallback((item: Product) => item.id, []);

  const renderProduct = useCallback(
    ({ item }: ListRenderItemInfo<Product>) => (
      <ProductTile
        item={item}
        onOpen={openProduct}
        onReserve={reserveProduct}
        reserving={reservingId === item.id}
      />
    ),
    [openProduct, reserveProduct, reservingId],
  );

  const onSelectCategory = useCallback((id: string) => {
    setActiveCategory(id);
  }, []);

  const ListHeader = useMemo(
    () => (
      <ProductsHeader
        topBounceHeight={topBounceHeight}
        topOffset={TOP_OFFSET}
        categories={categories}
        activeCategoryId={activeCategory}
        onSelectCategory={onSelectCategory}
        search={search}
        onChangeSearch={setSearch}
        loading={loading}
        totalCount={filteredProducts.length}
      />
    ),
    [
      TOP_OFFSET,
      categories,
      filteredProducts.length,
      loading,
      search,
      topBounceHeight,
      activeCategory,
      onSelectCategory,
    ],
  );

  return (
    <ScreenGate dataReady={dataReady} skeleton={<ProductsSkeleton />}>
      <View style={S.page}>
        <View style={S.fixedTop}>
          <View style={safeTopStyle} />

          <View style={[styles.stickyRowBase, { height: STICKY_ROW_H }]}>
            <View style={S.profileRow}>
              <Image source={{ uri: avatarUrl }} style={styles.avatar42} />
              <View>
                <Text style={S.hello}>Olá,</Text>
                <Text style={S.name} numberOfLines={1}>
                  {displayName}
                  {meLoading ? "…" : ""}
                </Text>
              </View>
            </View>

            <View style={S.topRightRow}>
              {/* ⭐ Nível do cliente (à esquerda do carrinho) */}
              {userLevelLabel ? (
                <Pressable
                  style={[
                    styles.iconBtn42,
                    S.levelBtn,
                    userLevelStyle?.container,
                  ]}
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

              <Pressable style={styles.iconBtn42} onPress={goCart}>
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

              <Pressable style={styles.iconBtn42} onPress={goNotifications}>
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
          data={filteredProducts}
          keyExtractor={keyProduct}
          renderItem={renderProduct}
          numColumns={2}
          columnWrapperStyle={S.gridRow}
          showsVerticalScrollIndicator={false}
          style={S.list}
          contentContainerStyle={S.listContent}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={<ProductsFooter onGoCart={goCart} />}
          ListEmptyComponent={
            <View style={{ padding: 18 }}>
              <Text
                style={{
                  color: UI.colors.black45,
                  textAlign: "center",
                  fontWeight: "600",
                }}
              >
                Nenhum produto encontrado.
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

  fixedTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 999,
  },

  filtersCard: {
    padding: UI.spacing.cardPad,
    marginTop: 14,
  },

  profileRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  hello: { color: UI.colors.textMuted, fontSize: 12, fontWeight: "700" },
  name: { color: UI.colors.text, fontSize: 16, fontWeight: "700" },

  topRightRow: { flexDirection: "row", gap: 10, alignItems: "center" },

  // ⭐ botão de nível (mesma base do iconBtn42, só adiciona mini label)
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

  list: { flex: 1, backgroundColor: UI.colors.white },
  listContent: { paddingBottom: 28 },

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

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },

  searchIcon: {
    width: 36,
    height: 36,
    borderRadius: UI.radius.input,
    backgroundColor: UI.colors.overlay10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
  },

  searchInput: {
    flex: 1,
    height: 40,
    color: UI.colors.text,
    fontSize: 15,
    paddingHorizontal: 6,
    fontWeight: "500",
  },

  chipsContent: { paddingRight: 8 },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: UI.radius.pill,
    backgroundColor: UI.colors.overlay08,
    borderWidth: 1,
    borderColor: UI.colors.overlay10,
    marginRight: 10,
  },
  chipActive: {
    backgroundColor: UI.brand.primary,
    borderColor: UI.colors.overlay18,
  },
  chipText: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
    fontSize: 13,
  },
  chipTextActive: { color: UI.colors.white },

  heroCard: {
    marginTop: 14,
    backgroundColor: "rgba(124,108,255,0.22)",
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPad,
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.35)",
  },
  heroRow: { flexDirection: "row", justifyContent: "space-between" },
  heroLeft: { flex: 1, paddingRight: 12 },

  heroKicker: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "700",
  },
  heroTitle: {
    color: UI.colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6,
  },
  heroSub: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },

  tileFooter: {
    marginTop: 12,
    gap: 10,
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

  reserveBtn: {
    height: 40,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  reserveBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  reserveBtnDisabled: {
    opacity: 0.75,
  },

  heroBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: UI.radius.pill,
    backgroundColor: UI.colors.overlay08,
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroBtnText: { color: UI.colors.text, fontSize: 14, fontWeight: "700" },

  heroThumb: {
    width: 64,
    height: 64,
    borderRadius: UI.radius.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.colors.overlay08,
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
  },

  whiteArea: { backgroundColor: UI.colors.white },
  whiteContent: { paddingHorizontal: UI.spacing.screenX, paddingTop: 18 },

  sectionRow: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: UI.brand.primaryText,
  },
  sectionMeta: {
    color: UI.colors.black45,
    fontSize: 12,
    fontWeight: "600",
  },

  gridRow: {
    paddingHorizontal: UI.spacing.screenX,
    justifyContent: "space-between",
  },

  productCard: {
    width: "48.2%",
    marginBottom: 14,
    borderRadius: UI.radius.card,
    backgroundColor: UI.colors.white,
    borderWidth: 1,
    borderColor: UI.colors.black08,
    padding: 12,
  },

  productImgWrap: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: UI.colors.black05,
    position: "relative",
  },
  productImage: { height: 124, width: "100%" },

  // 🎂 / ⭐
  badgePill: {
    position: "absolute",
    left: 10,
    top: 10,
    maxWidth: 190,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(20,20,20,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    zIndex: 2,
  },
  badgePillBirthday: {
    backgroundColor: "rgba(124,108,255,0.95)",
    borderColor: "rgba(255,255,255,0.30)",
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
    zIndex: 3,
  },
  outOfStockText: {
    color: UI.colors.white,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  productName: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: UI.brand.primaryText,
    lineHeight: 18,
    minHeight: 36,
  },

  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },

  // ✅ quando tem desconto, vira stack
  priceStack: {
    marginTop: 8,
    gap: 2,
  },

  productPrice: {
    fontSize: 16,
    fontWeight: "800",
    color: UI.brand.primaryText,
  },

  // base riscado (mais “leve”)
  productOldPriceBig: {
    textDecorationLine: "line-through",
    color: UI.colors.black45,
    fontWeight: "800",
    fontSize: 12,
  },

  footerWrap: {
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 8,
    paddingBottom: 24,
    backgroundColor: UI.colors.white,
  },

  bottomCTA: { gap: 10 },

  goCartBtn: {
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
  },
  goCartBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
