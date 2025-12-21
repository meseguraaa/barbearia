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

const HERO_H = 320;

type ApiProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  description: string;
  price: number;
  category: string | null;
  stockQuantity: number;
  isOutOfStock: boolean;
  pickupDeadlineDays: number;
  unitId: string;
  unitName: string;
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

export default function ProductDetails() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const productId = useMemo(() => String(id ?? "").trim(), [id]);

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<ApiProduct | null>(null);

  const fetchingRef = useRef(false);

  const fetchProduct = useCallback(async () => {
    if (!productId) return;
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

      setProduct({
        id: String(p.id),
        name: String(p.name ?? "Produto"),
        imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : null,
        description: String(p.description ?? ""),
        price: Number(p.price ?? 0),
        category: p.category ? String(p.category) : null,
        stockQuantity: Number(p.stockQuantity ?? 0),
        isOutOfStock: !!p.isOutOfStock,
        pickupDeadlineDays: Number(p.pickupDeadlineDays ?? 2),
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
    }
  }, [productId]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const priceLabel = useMemo(
    () => formatBRL(product?.price ?? 0),
    [product?.price],
  );

  const stockLabel = useMemo(() => {
    if (!product) return "—";
    if (product.isOutOfStock) return "Esgotado";
    return String(product.stockQuantity);
  }, [product]);

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

    // ✅ Aqui é onde vamos ligar com o fluxo real de reserva:
    // POST /api/mobile/orders/product-sale { productId, quantity: 1 }
    // Por enquanto, deixo um placeholder bem claro:
    Alert.alert(
      "Reserva",
      "Agora é só ligar o endpoint de reserva/pedido. Próximo passo ✅",
    );
  }, [product]);

  if (loading) {
    return (
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
    );
  }

  if (!product) {
    return (
      <View style={S.page}>
        <View style={[S.headerFloat, { top: insets.top + 10 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn42}>
            <FontAwesome name="angle-left" size={20} color={UI.colors.white} />
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
    );
  }

  return (
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

        {/* ✅ Badge simples de estoque (sem mudar layout) */}
        <View style={S.stockPill}>
          <FontAwesome
            name={product.isOutOfStock ? "times" : "check"}
            size={12}
            color={UI.colors.white}
            style={{ marginRight: 6 }}
          />
          <Text style={S.stockPillText}>
            {product.isOutOfStock ? "Esgotado" : `Estoque: ${stockLabel}`}
          </Text>
        </View>
      </View>

      {/* HEADER FLOAT */}
      <View style={[S.headerFloat, { top: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn42}>
          <FontAwesome name="angle-left" size={20} color={UI.colors.white} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={S.scroll}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* BLOCO PRINCIPAL (BRANCO) */}
        <View style={S.mainShell}>
          <View style={S.mainInner}>
            <Text style={S.category}>{product.category ?? "Produto"}</Text>
            <Text style={S.title}>{product.name}</Text>

            <View style={S.priceRow}>
              <Text style={S.price}>{priceLabel}</Text>
            </View>
          </View>
        </View>

        {/* CONTEÚDO */}
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

      {/* CTA FIXO */}
      <View style={[S.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[
            styles.pillPrimary,
            S.ctaBtn,
            product.isOutOfStock ? { opacity: 0.55 } : null,
          ]}
          onPress={onPressReserve}
          disabled={product.isOutOfStock}
        >
          <FontAwesome name="shopping-bag" size={16} color={UI.colors.white} />
          <Text style={styles.pillPrimaryText}>
            {product.isOutOfStock ? "Esgotado" : "Reservar"}
          </Text>
        </Pressable>
      </View>
    </View>
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

  stockPill: {
    position: "absolute",
    left: UI.spacing.screenX,
    bottom: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },

  stockPillText: {
    color: UI.colors.white,
    fontSize: 12,
    fontWeight: "800",
  },

  headerFloat: {
    position: "absolute",
    left: UI.spacing.screenX,
    right: UI.spacing.screenX,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 20,
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

  category: {
    color: "rgba(0,0,0,0.55)",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
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

  price: { color: UI.brand.primary, fontSize: 20, fontWeight: "600" },

  whiteArea: { backgroundColor: UI.colors.white },

  whiteContent: {
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 18,
    paddingBottom: 18,
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

  ctaBtn: { height: 56 },
});
