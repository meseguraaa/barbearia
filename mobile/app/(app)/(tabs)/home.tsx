import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  FlatList,
  ListRenderItemInfo,
  ActivityIndicator,
  Alert,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { UI } from "../../../src/theme/client-theme";
import { useAuth } from "../../../src/auth/auth-context";
import { api } from "../../../src/services/api";

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

type NextAppt = {
  id: string;
  serviceName: string;
  unitName: string;
  barberName: string;
  startsAtLabel: string; // ex: "20/12/2025 • 14:30"
  statusLabel: string;

  // ✅ opcional (se backend mandar, usamos)
  status?: string | null;

  unitId?: string | null;
  serviceId?: string | null;
  barberId?: string | null;

  // ✅ políticas (quando backend passar a mandar)
  canReschedule?: boolean;
  canCancel?: boolean;
  cancellationFeeEligible?: boolean;
  cancellationFeeNotice?: string | null;
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

  // ✅ Histórico preview (até 5)
  const [historyPreview, setHistoryPreview] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ✅ trava real (não depende do state)
  const fetchingRef = useRef(false);
  const fetchingHistoryRef = useRef(false);

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
      console.log("[home] next error:", err?.data ?? err?.message ?? err);
      setNext(null);
    } finally {
      setNextLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  const fetchHistoryPreview = useCallback(async () => {
    if (fetchingHistoryRef.current) return;
    fetchingHistoryRef.current = true;

    try {
      setHistoryLoading(true);

      const res = await api.get<{ ok: boolean; items: HistoryItem[] }>(
        "/api/mobile/me/history/preview",
      );

      setHistoryPreview(Array.isArray(res?.items) ? res.items.slice(0, 5) : []);
    } catch (err: any) {
      console.log(
        "[home] history preview error:",
        err?.data ?? err?.message ?? err,
      );
      setHistoryPreview([]);
    } finally {
      setHistoryLoading(false);
      fetchingHistoryRef.current = false;
    }
  }, []);

  // ✅ recarrega quando entrar/voltar pra Home (inclui primeira vez)
  useFocusEffect(
    useCallback(() => {
      fetchNext();
      fetchHistoryPreview();
    }, [fetchNext, fetchHistoryPreview]),
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

  const TOP_OFFSET = insets.top + STICKY_ROW_H;

  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );

  const headerSpacerStyle = useMemo(
    () => ({ height: TOP_OFFSET, backgroundColor: UI.colors.bg }),
    [TOP_OFFSET],
  );

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
      <HistoryRow item={item} showDivider={index < historyPreview.length - 1} />
    ),
    [historyPreview.length],
  );

  const goToBooking = useCallback(() => {
    router.push("/booking/unit");
  }, [router]);

  const goToHistory = useCallback(() => {
    router.push("/client/history");
  }, [router]);

  // ✅ ALTERAR: entra no mesmo fluxo do booking, mas em modo edição
  const onPressReschedule = useCallback(() => {
    if (!next) return;

    router.push({
      pathname: "/booking/unit",
      params: {
        mode: "edit",
        appointmentId: next.id,
      },
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

  const Header = useMemo(() => {
    const hasNext = !!next;

    const startsAtInline = hasNext
      ? String(next!.startsAtLabel || "").replace(" • ", " - ")
      : "";

    // ✅ ATENDIMENTO: some botões
    const isInService =
      hasNext &&
      (String(next!.status || "").toUpperCase() === "IN_SERVICE" ||
        String(next!.status || "").toUpperCase() === "ATENDIMENTO" ||
        String(next!.statusLabel || "").toUpperCase() === "ATENDIMENTO");

    // ✅ políticas (quando backend mandar). Por enquanto default true.
    const canReschedule = hasNext ? next!.canReschedule !== false : false;
    const canCancel = hasNext ? next!.canCancel !== false : false;

    // ✅ SEM MOSTRA: enquanto NÃO for ATENDIMENTO, a linha aparece (mesmo sem flags)
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
                  <View style={S.heroTitleRow}>
                    <Text style={S.heroTitle} numberOfLines={1}>
                      Seu agendamento - {startsAtInline}
                    </Text>
                  </View>

                  <Text style={S.apptService} numberOfLines={1}>
                    {next!.serviceName} com {next!.barberName}
                  </Text>

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

                  {showActions ? (
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
                        <Pressable style={S.actionBtn} onPress={onPressCancel}>
                          <Text style={S.actionText}>Cancelar</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
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

                  {nextLoading ? (
                    <View style={{ marginTop: 10, alignItems: "center" }}>
                      <ActivityIndicator />
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </View>

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
    <View style={S.page}>
      <View style={S.fixedTop}>
        <View style={safeTopStyle} />

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

          <Pressable style={S.iconBtn}>
            <FontAwesome name="bell-o" size={20} color={UI.colors.white} />
            <View style={S.dot} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={historyPreview}
        keyExtractor={keyHistory}
        renderItem={renderHistory}
        showsVerticalScrollIndicator={false}
        style={S.list}
        contentContainerStyle={S.listContent}
        ListHeaderComponent={Header}
        ListEmptyComponent={
          <View style={S.emptyHistoryBox}>
            {historyLoading ? (
              <>
                <ActivityIndicator />
                <Text style={S.emptyHistoryText}>
                  Carregando seu histórico…
                </Text>
              </>
            ) : (
              <Text style={S.emptyHistoryText}>
                Você ainda não tem histórico por aqui.
              </Text>
            )}
          </View>
        }
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

  // ✅ corrigido: não depende de UI.colors.warning (que não existe)
  statusPillInService: {
    backgroundColor: "rgba(255,193,7,0.95)",
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

  emptyApptText: {
    marginTop: 6,
    color: UI.colors.text,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    textAlign: "center",
  },

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
