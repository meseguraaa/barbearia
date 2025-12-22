// app/client/history.tsx
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, SectionList } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { UI } from "../../src/theme/client-theme";
import { api } from "../../src/services/api";

import { ScreenGate } from "../../src/components/layout/ScreenGate";
import { HistorySkeleton } from "../../src/components/loading/HistorySkeleton";

const STICKY_ROW_H = 74;

type HistoryItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  icon: string;
};

type HistoryResponse = {
  ok: boolean;
  done: HistoryItem[];
  canceled: HistoryItem[];
  orders: HistoryItem[];
  error?: string;
};

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
          <Text style={S.historyTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={S.historyDesc} numberOfLines={2}>
            {item.description}
          </Text>
          <Text style={S.historyDate} numberOfLines={1}>
            {item.date}
          </Text>
        </View>
      </View>

      {showDivider ? <View style={S.historyDivider} /> : null}
    </View>
  );
});

export default function ClientHistory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [done, setDone] = useState<HistoryItem[]>([]);
  const [canceled, setCanceled] = useState<HistoryItem[]>([]);
  const [orders, setOrders] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchingRef = useRef(false);

  // ✅ gate da tela: libera quando o fetch terminou ao menos 1x
  const didHistoryRef = useRef(false);
  const [dataReady, setDataReady] = useState(false);

  const recomputeReady = useCallback(() => {
    if (didHistoryRef.current) setDataReady(true);
  }, []);

  const fetchHistory = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setLoading(true);

      const res = await api.get<HistoryResponse>("/api/mobile/me/history");

      if (!res?.ok) {
        console.log("[history] api error:", res?.error);
        setDone([]);
        setCanceled([]);
        setOrders([]);
        return;
      }

      setDone(Array.isArray(res.done) ? res.done : []);
      setCanceled(Array.isArray(res.canceled) ? res.canceled : []);
      setOrders(Array.isArray(res.orders) ? res.orders : []);
    } catch (err: any) {
      console.log("[history] fetch error:", err?.data ?? err?.message ?? err);
      setDone([]);
      setCanceled([]);
      setOrders([]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;

      didHistoryRef.current = true;
      recomputeReady();
    }
  }, [recomputeReady]);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory]),
  );

  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );

  const goBack = useCallback(() => {
    router.back();
  }, [router]);

  const sections = useMemo(() => {
    return [
      {
        title: "Serviços realizados",
        subtitle: "Agendamentos concluídos.",
        data: done,
      },
      {
        title: "Cancelados",
        subtitle: "Horários cancelados, com ou sem taxa.",
        data: canceled,
      },
      {
        title: "Pedidos de produtos",
        subtitle: "Reservas e compras de produtos.",
        data: orders,
      },
    ] as Array<{ title: string; subtitle: string; data: HistoryItem[] }>;
  }, [canceled, done, orders]);

  const hasAny = useMemo(
    () => done.length + canceled.length + orders.length > 0,
    [done.length, canceled.length, orders.length],
  );

  const renderSectionHeader = useCallback(
    ({
      section,
    }: {
      section: { title: string; subtitle: string; data: HistoryItem[] };
    }) => (
      <View style={S.sectionHeader}>
        <Text style={S.sectionTitle}>{section.title}</Text>
        <Text style={S.sectionSubtitle}>{section.subtitle}</Text>

        {section.data.length === 0 && !loading ? (
          <View style={S.sectionEmptyPill}>
            <Text style={S.sectionEmptyText}>Nada por aqui</Text>
          </View>
        ) : null}
      </View>
    ),
    [loading],
  );

  const renderItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: HistoryItem;
      index: number;
      section: { data: HistoryItem[] };
    }) => (
      <HistoryRow item={item} showDivider={index < section.data.length - 1} />
    ),
    [],
  );

  const keyExtractor = useCallback((item: HistoryItem) => item.id, []);

  const listPadTop = useMemo(
    () => insets.top + STICKY_ROW_H + 10,
    [insets.top],
  );

  return (
    <ScreenGate dataReady={dataReady} skeleton={<HistorySkeleton />}>
      <View style={S.page}>
        {/* Header fixo (seta + título central) */}
        <View style={S.fixedTop}>
          <View style={safeTopStyle} />

          <View style={S.stickyRow}>
            {/* ✅ padronizado: roxinho + seta branca */}
            <Pressable style={S.backBtn} onPress={goBack}>
              <FontAwesome name="angle-left" size={22} color="#FFFFFF" />
            </Pressable>

            <View style={S.centerTitleWrap} pointerEvents="none">
              <Text style={S.centerTitle}>Histórico</Text>
            </View>

            <View style={{ width: 42, height: 42 }} />
          </View>
        </View>

        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[S.listContent, { paddingTop: listPadTop }]}
          style={S.list}
          ListEmptyComponent={
            !loading && !hasAny ? (
              <View style={S.emptyBox}>
                <FontAwesome
                  name="history"
                  size={18}
                  color={UI.brand.primary}
                />
                <Text style={S.emptyText}>Você ainda não tem histórico.</Text>
              </View>
            ) : null
          }
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          windowSize={9}
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

  stickyRow: {
    height: STICKY_ROW_H,
    backgroundColor: UI.colors.bg,
    paddingHorizontal: UI.spacing.screenX,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  // ✅ botão voltar roxinho + seta branca (padrão do app)
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

  centerTitleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  centerTitle: {
    color: UI.colors.white,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  list: { flex: 1, backgroundColor: UI.colors.white },
  listContent: { paddingBottom: 28 },

  sectionHeader: {
    paddingHorizontal: UI.spacing.screenX,
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

  sectionEmptyPill: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  sectionEmptyText: {
    fontSize: 12,
    fontWeight: "700",
    color: UI.brand.primaryText,
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
    backgroundColor: "rgba(124,108,255,0.12)",
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

  emptyBox: {
    paddingHorizontal: UI.spacing.screenX,
    paddingVertical: 18,
    alignItems: "center",
    gap: 10,
  },

  emptyText: {
    color: "rgba(0,0,0,0.55)",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
