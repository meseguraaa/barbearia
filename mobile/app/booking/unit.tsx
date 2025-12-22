// app/booking/unit.tsx
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ListRenderItemInfo,
  ActivityIndicator,
  Alert,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UI } from "../../src/theme/client-theme";
import { api } from "../../src/services/api";

import { ScreenGate } from "../../src/components/layout/ScreenGate";
import { BookingUnitSkeleton } from "../../src/components/loading/BookingUnitSkeleton";

const STICKY_ROW_H = 74;

type Unit = { id: string; name: string };

type AppointmentGetResponse = {
  ok: boolean;
  appointment: {
    id: string;
    status: string;

    unitId: string | null;
    unitName: string | null;

    serviceId: string | null;
    serviceName: string | null;

    barberId: string | null;
    barberName: string | null;

    dateISO: string;
    startTime: string;

    canReschedule?: boolean;
  };
};

const UnitRow = memo(function UnitRow({
  item,
  onPress,
  showDivider,
}: {
  item: Unit;
  onPress: () => void;
  showDivider: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={S.row}>
      <View style={S.rowLeft}>
        <View style={S.rowIcon}>
          <FontAwesome name="map-marker" size={18} color={UI.brand.primary} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={S.rowTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={S.rowMeta}>Selecione para continuar</Text>
        </View>
      </View>

      <FontAwesome name="chevron-right" size={14} color={UI.colors.black45} />
      {showDivider ? <View style={S.divider} /> : null}
    </Pressable>
  );
});

export default function BookingUnit() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    mode?: string;
    appointmentId?: string;
  }>();

  const isEdit = useMemo(() => String(params.mode ?? "") === "edit", [params]);

  const appointmentId = useMemo(
    () => String(params.appointmentId ?? "").trim(),
    [params.appointmentId],
  );

  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [currentUnitId, setCurrentUnitId] = useState<string | null>(null);

  // ✅ gate: sempre libera depois do primeiro ciclo (mesmo que bypass navegue)
  const didBootRef = useRef(false);
  const [dataReady, setDataReady] = useState(false);

  const TOP_OFFSET = insets.top + STICKY_ROW_H;

  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );

  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const goBack = useCallback(() => router.back(), [router]);

  const goService = useCallback(
    (u: Unit, replace?: boolean) => {
      const nav = {
        pathname: "/booking/service",
        params: {
          unitId: u.id,
          unitName: u.name,
          ...(isEdit ? { mode: "edit", appointmentId } : {}),
        },
      } as const;

      if (__DEV__) {
        console.log("[booking/unit] goService:", {
          unitId: u.id,
          unitName: u.name,
          goEdit: isEdit,
          appointmentId: isEdit ? appointmentId : undefined,
          replace: !!replace,
        });
      }

      if (replace) router.replace(nav);
      else router.push(nav);
    },
    [appointmentId, isEdit, router],
  );

  const fetchCurrentAppointmentIfNeeded = useCallback(async () => {
    if (!isEdit) return;

    if (!appointmentId) {
      Alert.alert("Ops", "appointmentId ausente no modo alterar.");
      router.back();
      return;
    }

    try {
      const res = await api.get<AppointmentGetResponse>(
        `/api/mobile/me/appointments/${encodeURIComponent(appointmentId)}`,
      );

      if (!res?.ok || !res?.appointment) {
        Alert.alert(
          "Erro",
          "Não foi possível carregar o agendamento para edição.",
        );
        router.back();
        return;
      }

      if (res.appointment.canReschedule === false) {
        Alert.alert(
          "Não é possível alterar",
          "Este agendamento não pode ser alterado agora.",
        );
        router.back();
        return;
      }

      setCurrentUnitId(res.appointment.unitId ?? null);
    } catch (err: any) {
      console.log(
        "[booking/unit][edit] error:",
        err?.data ?? err?.message ?? err,
      );

      const msg =
        err?.data?.error ||
        err?.message ||
        "Não foi possível carregar o agendamento para edição.";

      Alert.alert("Erro", String(msg));
      router.back();
    }
  }, [appointmentId, isEdit, router]);

  const fetchUnits = useCallback(async () => {
    try {
      setLoading(true);

      const res = await api.get<{ ok: boolean; units: Unit[]; count?: number }>(
        "/api/mobile/units",
      );

      const list: Unit[] = Array.isArray(res?.units) ? res.units : [];
      setUnits(list);

      if (__DEV__) console.log("[booking/unit] units:", list.length);

      // ✅ bypass: 1 unidade
      if (list.length === 1) {
        goService(list[0], true);
        return;
      }

      // ✅ bypass: edit com unit atual
      if (isEdit && currentUnitId) {
        const current = list.find((u) => u.id === currentUnitId);
        if (current) {
          goService(current, true);
          return;
        }
      }
    } catch (err: any) {
      console.log("[booking/unit] error:", err?.data ?? err?.message ?? err);

      const msg =
        err?.data?.error ||
        err?.message ||
        "Não foi possível carregar as unidades. Tente novamente.";

      Alert.alert("Erro", String(msg));
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, [currentUnitId, goService, isEdit]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await fetchCurrentAppointmentIfNeeded();
        if (!alive) return;

        await fetchUnits();
      } finally {
        didBootRef.current = true;
        if (alive) setDataReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [fetchCurrentAppointmentIfNeeded, fetchUnits]);

  const key = useCallback((item: Unit) => item.id, []);
  const render = useCallback(
    ({ item, index }: ListRenderItemInfo<Unit>) => (
      <UnitRow
        item={item}
        onPress={() => goService(item)}
        showDivider={index < units.length - 1}
      />
    ),
    [goService, units.length],
  );

  return (
    <ScreenGate dataReady={dataReady} skeleton={<BookingUnitSkeleton />}>
      <View style={S.page}>
        <View style={S.fixedTop}>
          <View style={safeTopStyle} />

          <View style={S.stickyRow}>
            <Pressable onPress={goBack} style={S.backBtn} hitSlop={8}>
              <FontAwesome
                name="chevron-left"
                size={18}
                color={UI.colors.white}
              />
            </Pressable>

            <Text style={S.title}>
              {isEdit ? "Alterar agendamento" : "Agendamento"}
            </Text>

            <View style={{ width: 42, height: 42 }} />
          </View>
        </View>

        <View
          pointerEvents="none"
          style={[S.topBounceDark, { height: topBounceHeight }]}
        />
        <View style={{ height: TOP_OFFSET }} />

        {/* ⬛ darkShell com raio (agora aparece pq o fundo atrás é branco) */}
        <View style={S.darkShell}>
          <View style={S.darkInner}>
            <View style={S.heroCard}>
              <Text style={S.heroTitle}>Escolha a unidade</Text>
              <Text style={S.heroDesc}>
                Se houver apenas uma, a gente pula automaticamente.
              </Text>

              {isEdit ? (
                <Text style={S.heroDesc}>
                  {"\n"}Estamos abrindo a edição do seu agendamento.
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={S.whiteArea}>
          <View style={S.whiteContent}>
            <Text style={S.sectionTitle}>Unidades</Text>

            {loading ? (
              <View style={S.centerBox}>
                <ActivityIndicator />
                <Text style={S.centerText}>Carregando…</Text>
              </View>
            ) : units.length === 0 ? (
              <View style={S.centerBox}>
                <Text style={S.emptyTitle}>Nenhuma unidade disponível</Text>
                <Text style={S.centerText}>
                  Não encontramos unidades ativas.
                </Text>

                <Pressable style={S.secondaryBtn} onPress={fetchUnits}>
                  <Text style={S.secondaryBtnText}>Tentar novamente</Text>
                </Pressable>
              </View>
            ) : (
              <FlatList
                data={units}
                keyExtractor={key}
                renderItem={render}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 18 }}
              />
            )}
          </View>
        </View>
      </View>
    </ScreenGate>
  );
}

const S = StyleSheet.create({
  // ✅ CHAVE: fundo branco atrás do darkShell (pra recorte aparecer)
  page: { flex: 1, backgroundColor: UI.colors.white },

  fixedTop: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 999 },

  stickyRow: {
    height: STICKY_ROW_H,
    backgroundColor: UI.colors.bg,
    paddingHorizontal: UI.spacing.screenX,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: UI.brand.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  title: { color: UI.colors.text, fontSize: 16, fontWeight: "700" },

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

  // ⚠️ card NÃO mexe (mantive o que você tinha antes do pedido do “tema”)
  heroCard: {
    marginTop: 14,
    backgroundColor: "rgba(124,108,255,0.22)",
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPad,
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.35)",
  },
  heroTitle: { color: UI.colors.text, fontSize: 18, fontWeight: "600" },
  heroDesc: {
    marginTop: 8,
    color: UI.colors.textDim,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },

  whiteArea: { flex: 1, backgroundColor: UI.colors.white },
  whiteContent: {
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 18,
    flex: 1,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: UI.brand.primaryText,
  },

  centerBox: { paddingVertical: 18, alignItems: "center", gap: 10 },
  centerText: {
    color: "rgba(0,0,0,0.55)",
    fontWeight: "600",
    textAlign: "center",
  },
  emptyTitle: {
    color: UI.brand.primaryText,
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },

  secondaryBtn: {
    marginTop: 8,
    height: 52,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryBtnText: { color: UI.brand.primaryText, fontWeight: "700" },

  row: {
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
  },
  rowLeft: { flexDirection: "row", gap: 12, flex: 1, alignItems: "center" },

  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(124,108,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontWeight: "700", color: UI.brand.primaryText, fontSize: 14 },
  rowMeta: { marginTop: 3, fontSize: 12, color: "rgba(0,0,0,0.55)" },

  divider: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
});
