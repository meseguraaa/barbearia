import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  FlatList,
  ListRenderItemInfo,
  TextInput,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { UI, styles } from "../../../../src/theme/client-theme";

const STICKY_ROW_H = 74;

type Category = { id: string; label: string };

type Product = {
  id: string;
  name: string;
  price: string;
  oldPrice: string;
  badge: string;
  image: string;
};

type ProductsHeaderProps = {
  topBounceHeight: number;
  topOffset: number;
  categories: Category[];
};

const CategoryChip = memo(function CategoryChip({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <Pressable style={[S.chip, active ? S.chipActive : null]}>
      <Text style={[S.chipText, active ? S.chipTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
});

const ProductTile = memo(function ProductTile({
  item,
  onOpen,
}: {
  item: Product;
  onOpen: (id: string) => void;
}) {
  const canOpen = item.id === "1"; // ✅ por enquanto só o primeiro produto

  return (
    <Pressable
      style={S.productCard}
      onPress={canOpen ? () => onOpen(item.id) : undefined}
      disabled={!canOpen}
    >
      <View style={S.productImgWrap}>
        <Image source={{ uri: item.image }} style={S.productImage} />
        <View style={S.badge}>
          <Text style={S.badgeText}>{item.badge}</Text>
        </View>

        <Pressable style={S.favBtn}>
          <FontAwesome name="heart-o" size={16} color={UI.colors.white} />
        </Pressable>
      </View>

      <Text numberOfLines={2} style={S.productName}>
        {item.name}
      </Text>

      <View style={S.priceRow}>
        <Text style={S.productPrice}>{item.price}</Text>
        <Text style={S.productOldPrice}>{item.oldPrice}</Text>
      </View>

      <Pressable style={[styles.pillPrimary, S.addBtn]}>
        <FontAwesome name="plus" size={14} color={UI.colors.white} />
        <Text style={styles.pillPrimaryText}>Adicionar</Text>
      </Pressable>
    </Pressable>
  );
});

const ProductsHeader = memo(function ProductsHeader({
  topBounceHeight,
  topOffset,
  categories,
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
          <View style={styles.glassCard}>
            <View style={S.searchRow}>
              <View style={S.searchIcon}>
                <FontAwesome name="search" size={16} color={UI.colors.white} />
              </View>

              <TextInput
                placeholder="Buscar produtos..."
                placeholderTextColor="rgba(255,255,255,0.55)"
                style={S.searchInput}
              />
            </View>

            <FlatList
              data={categories}
              keyExtractor={(c) => c.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={S.chipsContent}
              renderItem={({ item, index }: ListRenderItemInfo<Category>) => (
                <CategoryChip label={item.label} active={index === 0} />
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
          </View>
        </View>
      </View>
    </View>
  );
});

const ProductsFooter = memo(function ProductsFooter() {
  return (
    <View style={S.footerWrap}>
      <View style={S.bottomCTA}>
        <Pressable style={[styles.pillPrimary, S.checkoutBtn]}>
          <Text style={[styles.pillPrimaryText, S.checkoutText]}>
            Ir para o carrinho
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

export default function Products() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const me = useMemo(
    () => ({
      name: "Bruno Leal",
      avatar: "https://i.pravatar.cc/200?img=12",
    }),
    [],
  );

  const categories = useMemo<Category[]>(
    () => [
      { id: "all", label: "Todos" },
      { id: "hair", label: "Cabelo" },
      { id: "beard", label: "Barba" },
      { id: "wash", label: "Higiene" },
      { id: "acc", label: "Acessórios" },
    ],
    [],
  );

  const products = useMemo<Product[]>(
    () => [
      {
        id: "1",
        name: "Pomada Matte Efeito Seco",
        price: "R$ 49,90",
        oldPrice: "R$ 59,90",
        badge: "15% OFF",
        image: "https://picsum.photos/seed/pomada/600/420",
      },
      {
        id: "2",
        name: "Óleo de Barba Premium",
        price: "R$ 39,90",
        oldPrice: "R$ 49,90",
        badge: "Mais vendido",
        image: "https://picsum.photos/seed/oleo/600/420",
      },
      {
        id: "3",
        name: "Shampoo Black",
        price: "R$ 59,90",
        oldPrice: "R$ 69,90",
        badge: "Novo",
        image: "https://picsum.photos/seed/shampoo/600/420",
      },
      {
        id: "4",
        name: "Pente Carbono Anti-estático",
        price: "R$ 19,90",
        oldPrice: "R$ 29,90",
        badge: "Oferta",
        image: "https://picsum.photos/seed/pente/600/420",
      },
      {
        id: "5",
        name: "Balm Pós Barba",
        price: "R$ 34,90",
        oldPrice: "R$ 44,90",
        badge: "Top",
        image: "https://picsum.photos/seed/balm/600/420",
      },
      {
        id: "6",
        name: "Spray Texturizador",
        price: "R$ 54,90",
        oldPrice: "R$ 64,90",
        badge: "Novo",
        image: "https://picsum.photos/seed/spray/600/420",
      },
    ],
    [],
  );

  const TOP_OFFSET = insets.top + STICKY_ROW_H;

  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );

  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const openProduct = useCallback(
    (id: string) => {
      router.push(`/products/${id}`);
    },
    [router],
  );

  const keyProduct = useCallback((item: Product) => item.id, []);
  const renderProduct = useCallback(
    ({ item }: ListRenderItemInfo<Product>) => (
      <ProductTile item={item} onOpen={openProduct} />
    ),
    [openProduct],
  );

  const ListHeader = useMemo(
    () => (
      <ProductsHeader
        topBounceHeight={topBounceHeight}
        topOffset={TOP_OFFSET}
        categories={categories}
      />
    ),
    [TOP_OFFSET, categories, topBounceHeight],
  );

  return (
    <View style={S.page}>
      <View style={S.fixedTop}>
        <View style={safeTopStyle} />

        <View style={[styles.stickyRowBase, { height: STICKY_ROW_H }]}>
          <View style={S.profileRow}>
            <Image source={{ uri: me.avatar }} style={styles.avatar42} />
            <View>
              <Text style={S.hello}>Olá</Text>
              <Text style={S.name}>Bruno Leal</Text>
            </View>
          </View>

          <View style={S.topRightRow}>
            <Pressable style={styles.iconBtn42}>
              <FontAwesome
                name="shopping-bag"
                size={18}
                color={UI.colors.white}
              />
              <View style={styles.iconDot} />
            </Pressable>

            <Pressable style={styles.iconBtn42}>
              <FontAwesome name="bell-o" size={20} color={UI.colors.white} />
            </Pressable>
          </View>
        </View>
      </View>

      <FlatList
        data={products}
        keyExtractor={keyProduct}
        renderItem={renderProduct}
        numColumns={2}
        columnWrapperStyle={S.gridRow}
        showsVerticalScrollIndicator={false}
        style={S.list}
        contentContainerStyle={S.listContent}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={<ProductsFooter />}
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
  page: { flex: 1, backgroundColor: UI.colors.bg },

  fixedTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 999,
  },

  profileRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  hello: { color: UI.colors.textMuted, fontSize: 12, fontWeight: "500" },
  name: { color: UI.colors.text, fontSize: 16, fontWeight: "700" },

  topRightRow: { flexDirection: "row", gap: 10, alignItems: "center" },

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
    marginBottom: 12,
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

  sectionRow: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: UI.brand.primaryText,
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

  badge: {
    position: "absolute",
    left: 10,
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: UI.radius.pill,
    backgroundColor: UI.brand.primary,
  },
  badgeText: { color: UI.colors.white, fontSize: 11, fontWeight: "800" },

  favBtn: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: UI.colors.black28,
    alignItems: "center",
    justifyContent: "center",
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
  productPrice: {
    fontSize: 16,
    fontWeight: "800",
    color: UI.brand.primaryText,
  },
  productOldPrice: {
    textDecorationLine: "line-through",
    color: UI.colors.black45,
    fontWeight: "600",
    fontSize: 12,
  },

  addBtn: { height: 42, marginTop: 12 },

  footerWrap: {
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 8,
    paddingBottom: 24,
    backgroundColor: UI.colors.white,
  },

  bottomCTA: { gap: 10 },
  checkoutBtn: { height: 54 },
  checkoutText: { fontSize: 16 },
});
