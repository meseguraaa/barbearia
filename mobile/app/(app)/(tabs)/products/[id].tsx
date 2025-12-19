import { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FontAwesome } from "@expo/vector-icons";

import { UI, styles } from "../../../../src/theme/client-theme";

const HERO_H = 320;

type ProductDetail = {
  id: string;
  name: string;
  category: string;
  price: string;
  description: string;
  image: string;
  extra: { label: string; value: string }[];
};

export default function ProductDetails() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const catalog = useMemo<ProductDetail[]>(
    () => [
      {
        id: "1",
        name: "Pomada Matte Efeito Seco",
        category: "Cabelo",
        price: "R$ 49,90",
        description:
          "Pomada modeladora com efeito seco, ideal para penteados modernos e acabamento natural. Fixação média, não oleosa e fácil de remover.",
        image: "https://picsum.photos/seed/pomada/900/900",
        extra: [
          { label: "Fixação", value: "Média" },
          { label: "Acabamento", value: "Matte" },
          { label: "Categoria", value: "Cabelo" },
        ],
      },
      {
        id: "2",
        name: "Óleo de Barba Premium",
        category: "Barba",
        price: "R$ 39,90",
        description:
          "Óleo para hidratar, alinhar e perfumar. Ajuda a reduzir frizz e dá brilho na medida certa.",
        image: "https://picsum.photos/seed/oleo/900/900",
        extra: [
          { label: "Uso", value: "Diário" },
          { label: "Textura", value: "Leve" },
          { label: "Categoria", value: "Barba" },
        ],
      },
    ],
    [],
  );

  const product = useMemo(() => {
    const found = catalog.find((p) => p.id === String(id));
    return (
      found ?? {
        id: String(id ?? ""),
        name: "Produto",
        category: "Categoria",
        price: "R$ --,--",
        description:
          "Não encontramos esse produto no mock. Quando conectar na API, isso some.",
        image: "https://picsum.photos/seed/notfound/900/900",
        extra: [{ label: "ID", value: String(id ?? "—") }],
      }
    );
  }, [catalog, id]);

  return (
    <View style={S.page}>
      {/* HERO IMAGE */}
      <View style={{ height: HERO_H }}>
        <Image source={{ uri: product.image }} style={S.heroImage} />
        <View style={S.heroOverlay} />
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
            <Text style={S.category}>{product.category}</Text>
            <Text style={S.title}>{product.name}</Text>

            <View style={S.priceRow}>
              <Text style={S.price}>{product.price}</Text>
            </View>
          </View>
        </View>

        {/* CONTEÚDO */}
        <View style={S.whiteArea}>
          <View style={S.whiteContent}>
            <Text style={S.sectionTitle}>Sobre o produto</Text>
            <Text style={S.description}>{product.description}</Text>

            <View style={S.infoGrid}>
              {product.extra.map((item) => (
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
        <Pressable style={[styles.pillPrimary, S.ctaBtn]}>
          <FontAwesome name="shopping-bag" size={16} color={UI.colors.white} />
          <Text style={styles.pillPrimaryText}>Adicionar ao carrinho</Text>
        </Pressable>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  // ✅ fundo branco na tela toda
  page: { flex: 1, backgroundColor: UI.colors.white },

  scroll: { flex: 1, backgroundColor: UI.colors.white },

  heroImage: {
    width: "100%",
    height: "100%",
  },

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

  // ✅ bloco branco com borda arredondada, trazendo o conteúdo pra baixo e com mais respiro da foto
  mainShell: {
    backgroundColor: UI.colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -10,
  },

  // ✅ padding maior pra não ficar colado na foto
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
    fontWeight: "600", // ✅ no máximo 600
    lineHeight: 30,
  },

  priceRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  // ✅ preço roxinho
  price: {
    color: UI.brand.primary,
    fontSize: 20,
    fontWeight: "600", // ✅ no máximo 600
  },

  whiteArea: { backgroundColor: UI.colors.white },

  // ✅ conteúdo com padding maior (mais “ar”)
  whiteContent: {
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 18,
    paddingBottom: 18,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600", // ✅ no máximo 600
    color: UI.brand.primaryText,
    marginBottom: 10,
  },

  description: {
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(0,0,0,0.72)",
    fontWeight: "400",
  },

  infoGrid: {
    marginTop: 20,
    gap: 12,
  },

  infoItem: {
    padding: 14,
    borderRadius: UI.radius.card,
    backgroundColor: "rgba(0,0,0,0.04)",
  },

  infoLabel: {
    fontSize: 12,
    color: "rgba(0,0,0,0.55)",
    fontWeight: "600", // ✅ no máximo 600
  },

  infoValue: {
    fontSize: 15,
    fontWeight: "600", // ✅ no máximo 600
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

  ctaBtn: {
    height: 56,
  },
});
