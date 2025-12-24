import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { UI, styles } from "../../../../src/theme/client-theme";
import { api } from "../../../../src/services/api";

import { ScreenGate } from "../../../../src/components/layout/ScreenGate";
import { ProductDetailsSkeleton } from "../../../../src/components/loading/ProductDetailsSkeleton";

const HERO_H = 320;

type ProductBadge =
  | { type: "BIRTHDAY"; label: string }
  | { type: "LEVEL"; label: string }
  | null;

type ApiProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  description: string;

  // compat: preço final
  price: number;

  // ✅ motor de preço
  basePrice?: number;
  finalPrice?: number;
  hasDiscount?: boolean;
  badge?: ProductBadge;

  category: string | null;
  stockQuantity: number;
  isOutOfStock: boolean;
  pickupDeadlineDays: number;
  unitId: string;
  unitName: string;
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

export default function ProductDetails() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const productId = useMemo(() => String(id ?? "").trim(), [id]);

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [reserving, setReserving] = useState(false);

  const fetchingRef = useRef(false);

  // ✅ gate: libera quando a primeira tentativa terminar (sucesso/erro/vazio)
  const [dataReady, setDataReady] = useState(false);

  const fetchProduct = useCallback(async () => {
    setDataReady(false);

    if (!productId) {
      setLoading(false);
      setProduct(null);
      setDataReady(true);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setLoading(true);

      const res = await api.get<{
        ok?: boolean;
        product?: ApiProduct;
        item?: ApiProduct;
      }>(`/api/mobile/products/${encodeURIComponent(productId)}`);

      const p = (res?.product ?? res?.item ?? null) as any;

      if (!p?.id) {
        setProduct(null);
        return;
      }

      const basePrice = safeNumber(p?.basePrice, NaN);
      const finalPrice = safeNumber(p?.finalPrice, NaN);

      const hasDiscount =
        !!p?.hasDiscount &&
        Number.isFinite(basePrice) &&
        Number.isFinite(finalPrice) &&
        finalPrice < basePrice;

      const badge: ProductBadge =
        p?.badge &&
        typeof p.badge === "object" &&
        String(p.badge.label ?? "").trim()
          ? {
              type: p.badge.type === "BIRTHDAY" ? "BIRTHDAY" : "LEVEL",
              label: String(p.badge.label ?? "").trim(),
            }
          : null;

      const final = Number.isFinite(finalPrice)
        ? finalPrice
        : safeNumber(p?.price, 0);

      setProduct({
        id: String(p.id),
        name: String(p.name ?? "Produto"),
        imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : null,
        description: String(p.description ?? ""),

        // compat: price = final
        price: final,

        basePrice: Number.isFinite(basePrice) ? basePrice : undefined,
        finalPrice: Number.isFinite(finalPrice) ? finalPrice : undefined,
        hasDiscount,
        badge,

        category: p.category ? String(p.category) : null,
        stockQuantity: safeNumber(p.stockQuantity, 0),
        isOutOfStock: !!p.isOutOfStock,
        pickupDeadlineDays: safeNumber(p.pickupDeadlineDays, 2),
        unitId: String(p.unitId ?? ""),
        unitName: String(p.unitName ?? "—"),
      });
    } catch (err: any) {
      console.log("[product details] error:", err?.data ?? err?.message ?? err);

      const msg =
        err?.data?.error ||
        err?.message ||
        "Não foi possível carregar o produto.";

      Alert.alert("Erro", String(msg));
      setProduct(null);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
      setDataReady(true);
    }
  }, [productId]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  // ✅ regra de exibição: base riscado + final quando desconto
  const pricing = useMemo(() => {
    const p = product;
    if (!p) return { base: 0, final: 0, hasDiscount: false };

    const base = safeNumber(p.basePrice, NaN);
    const final = safeNumber(p.finalPrice, NaN);

    if (Number.isFinite(base) && Number.isFinite(final)) {
      const has = !!p.hasDiscount && final < base;
      return { base, final, hasDiscount: has };
    }

    const only = safeNumber(p.price, 0);
    return { base: only, final: only, hasDiscount: false };
  }, [product]);

  const baseLabel = useMemo(
    () => formatMoneySmartBRL(pricing.base),
    [pricing.base],
  );
  const finalLabel = useMemo(
    () => formatMoneySmartBRL(pricing.final),
    [pricing.final],
  );

  const extra = useMemo(() => {
    const p = product;
    if (!p) return [{ label: "ID", value: productId || "—" }];

    return [
      { label: "Unidade", value: p.unitName || "—" },
      {
        label: "Estoque",
        value: p.isOutOfStock ? "Esgotado" : String(p.stockQuantity),
      },
      { label: "Prazo p/ retirada", value: `${p.pickupDeadlineDays} dia(s)` },
      ...(p.category ? [{ label: "Categoria", value: p.category }] : []),
    ];
  }, [product, productId]);

  const onPressReserve = useCallback(async () => {
    if (!product) return;

    if (product.isOutOfStock) {
      Alert.alert("Esgotado", "Este produto está sem estoque no momento.");
      return;
    }

    if (reserving) return;

    try {
      setReserving(true);

      const res = await api.post<{
        ok: boolean;
        orderId?: string;
        reservedUntil?: string;
      }>("/api/mobile/orders", { productId, quantity: 1 });

      const orderId = res?.orderId;

      if (!res?.ok || !orderId) throw new Error("invalid_response");

      router.push({ pathname: "/client/cart", params: { orderId } });
    } catch (err) {
      console.log("[reserve details] error:", err);
      Alert.alert("Erro", "Não foi possível reservar agora. Tente novamente.");
    } finally {
      setReserving(false);
    }
  }, [product, reserving, router, productId]);

  return (
    <ScreenGate dataReady={dataReady} skeleton={<ProductDetailsSkeleton />}>
      {loading && !dataReady ? (
        <View
          style={[S.page, { alignItems: "center", justifyContent: "center" }]}
        >
          <ActivityIndicator />
          <Text
            style={{
              marginTop: 10,
              color: "rgba(0,0,0,0.55)",
              fontWeight: "600",
            }}
          >
            Carregando produto…
          </Text>
        </View>
      ) : !product ? (
        <View style={S.page}>
          <View style={[S.headerFloat, { top: insets.top + 10 }]}>
            <Pressable onPress={() => router.back()} style={S.backBtn}>
              <FontAwesome name="angle-left" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <View
            style={{ padding: UI.spacing.screenX, paddingTop: insets.top + 90 }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: UI.brand.primaryText,
              }}
            >
              Produto não encontrado
            </Text>

            <Text
              style={{ marginTop: 8, color: "rgba(0,0,0,0.65)", fontSize: 14 }}
            >
              Esse produto pode ter sido removido, desativado ou você está sem
              conexão.
            </Text>

            <Pressable
              onPress={fetchProduct}
              style={[
                styles.pillPrimary,
                {
                  marginTop: 14,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Text style={styles.pillPrimaryText}>Tentar novamente</Text>
            </Pressable>

            <Pressable
              onPress={() => router.back()}
              style={[
                {
                  marginTop: 10,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  backgroundColor: "rgba(0,0,0,0.04)",
                  borderWidth: 1,
                  borderColor: "rgba(0,0,0,0.06)",
                },
              ]}
            >
              <Text style={{ fontWeight: "800", color: UI.brand.primaryText }}>
                Voltar
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={S.page}>
          {/* HERO IMAGE */}
          <View style={{ height: HERO_H }}>
            <Image
              source={{
                uri:
                  product.imageUrl ||
                  "https://picsum.photos/seed/product-placeholder/900/900",
              }}
              style={S.heroImage}
            />
            <View style={S.heroOverlay} />

            {/* 🎂 / ⭐ badge do motor */}
            {product.badge?.label ? (
              <View
                style={[
                  S.heroBadge,
                  product.badge.type === "BIRTHDAY"
                    ? S.heroBadgeBirthday
                    : null,
                ]}
              >
                <Text style={S.heroBadgeText} numberOfLines={1}>
                  {product.badge.label}
                </Text>
              </View>
            ) : null}

            {/* (opcional) pill de esgotado no hero */}
            {product.isOutOfStock ? (
              <View style={S.outPill}>
                <Text style={S.outPillText}>ESGOTADO</Text>
              </View>
            ) : null}
          </View>

          <View style={[S.headerFloat, { top: insets.top + 10 }]}>
            <Pressable onPress={() => router.back()} style={S.backBtn}>
              <FontAwesome name="angle-left" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={S.scroll}
            contentContainerStyle={{ paddingBottom: 140 }}
          >
            <View style={S.mainShell}>
              <View style={S.mainInner}>
                <Text style={S.title}>{product.name}</Text>

                {/* ✅ regra do preço */}
                {pricing.hasDiscount ? (
                  <View style={S.priceStack}>
                    <Text style={S.oldPrice}>{baseLabel}</Text>
                    <Text style={S.price}>{finalLabel}</Text>
                  </View>
                ) : (
                  <View style={S.priceRow}>
                    <Text style={S.price}>{finalLabel}</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={S.whiteArea}>
              <View style={S.whiteContent}>
                <Text style={S.sectionTitle}>Sobre o produto</Text>
                <Text style={S.description}>
                  {product.description || "Sem descrição."}
                </Text>

                <View style={S.infoGrid}>
                  {extra.map((item) => (
                    <View key={item.label} style={S.infoItem}>
                      <Text style={S.infoLabel}>{item.label}</Text>
                      <Text style={S.infoValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={[S.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable
              style={[
                S.reserveBtn,
                product.isOutOfStock || reserving ? { opacity: 0.75 } : null,
              ]}
              onPress={onPressReserve}
              disabled={product.isOutOfStock || reserving}
            >
              {reserving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <FontAwesome
                  name="shopping-bag"
                  size={16}
                  color="#FFFFFF"
                  style={{ marginRight: 10 }}
                />
              )}

              <Text style={S.reserveBtnText}>
                {product.isOutOfStock
                  ? "Esgotado"
                  : reserving
                    ? "Reservando…"
                    : "Reservar"}
              </Text>

              <FontAwesome
                name="angle-right"
                size={18}
                color="#FFFFFF"
                style={{ marginLeft: 10 }}
              />
            </Pressable>
          </View>
        </View>
      )}
    </ScreenGate>
  );
}

const S = StyleSheet.create({
  page: { flex: 1, backgroundColor: UI.colors.white },
  scroll: { flex: 1, backgroundColor: UI.colors.white },

  heroImage: { width: "100%", height: "100%" },

  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },

  headerFloat: {
    position: "absolute",
    left: UI.spacing.screenX,
    right: UI.spacing.screenX,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 20,
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: UI.brand.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },

  // 🎂 / ⭐ pill no hero
  heroBadge: {
    position: "absolute",
    left: UI.spacing.screenX,
    bottom: 16,
    maxWidth: 260,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(20,20,20,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  heroBadgeBirthday: {
    backgroundColor: "rgba(124,108,255,0.95)",
    borderColor: "rgba(255,255,255,0.30)",
  },
  heroBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  // (opcional) esgotado
  outPill: {
    position: "absolute",
    right: UI.spacing.screenX,
    bottom: 16,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: UI.brand.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  outPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  mainShell: {
    backgroundColor: UI.colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -10,
  },

  mainInner: {
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 30,
    paddingBottom: 18,
  },

  title: {
    color: UI.brand.primaryText,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
  },

  priceRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  // ✅ stack quando tem desconto
  priceStack: {
    marginTop: 14,
    gap: 4,
  },

  oldPrice: {
    textDecorationLine: "line-through",
    color: "rgba(0,0,0,0.45)",
    fontSize: 13,
    fontWeight: "800",
  },

  price: { color: UI.brand.primary, fontSize: 20, fontWeight: "600" },

  whiteArea: { backgroundColor: UI.colors.white },

  whiteContent: {
    paddingHorizontal: UI.spacing.screenX,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: UI.brand.primaryText,
    marginBottom: 10,
  },

  description: {
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(0,0,0,0.72)",
    fontWeight: "400",
  },

  infoGrid: { marginTop: 20, gap: 12 },

  infoItem: {
    padding: 14,
    borderRadius: UI.radius.card,
    backgroundColor: "rgba(0,0,0,0.04)",
  },

  infoLabel: {
    fontSize: 12,
    color: "rgba(0,0,0,0.55)",
    fontWeight: "600",
  },

  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: UI.brand.primaryText,
    marginTop: 4,
  },

  ctaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: UI.colors.white,
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },

  reserveBtn: {
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  reserveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
