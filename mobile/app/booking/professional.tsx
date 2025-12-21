// app/booking/professional.tsx
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
import { BookingProfessionalSkeleton } from "../../src/components/loading/BookingProfessionalSkeleton";

const STICKY_ROW_H = 74;

type Barber = {
  id: string;
  name: string;
};

type BarbersResponse = {
  ok?: boolean;
  barbers?: Barber[];
  error?: string;
};

const BarberRow = memo(function BarberRow({
  item,
  onPress,
  showDivider,
  isCurrent,
}: {
  item: Barber;
  onPress: () => void;
  showDivider: boolean;
  isCurrent: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={S.row}>
      <View style={S.rowLeft}>
        <View style={S.avatar}>
          <FontAwesome name="user" size={18} color={UI.brand.primary} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={S.rowTitle} numberOfLines={1}>
              {item.name}
            </Text>

            {isCurrent ? (
              <View style={S.currentBadge}>
                <Text style={S.currentBadgeText}>Atual</Text>
              </View>
            ) : null}
          </View>

          <Text style={S.rowMeta}>
            {isCurrent ? "Profissional atual" : "Toque para escolher"}
          </Text>
        </View>
      </View>

      <FontAwesome name="chevron-right" size={14} color={UI.colors.black45} />
      {showDivider ? <View style={S.divider} /> : null}
    </Pressable>
  );
});

export default function BookingProfessional() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    unitId?: string;
    unitName?: string;
    serviceId?: string;
    serviceName?: string;
    serviceDurationMinutes?: string;

    mode?: string;
    appointmentId?: string;

    currentBarberId?: string;
    currentScheduleAt?: string;
    currentDateISO?: string;
    currentStartTime?: string;
  }>();

  const unitId = useMemo(() => String(params.unitId ?? ""), [params.unitId]);
  const unitName = useMemo(
    () => String(params.unitName ?? ""),
    [params.unitName],
  );

  const serviceId = useMemo(
    () => String(params.serviceId ?? ""),
    [params.serviceId],
  );
  const serviceName = useMemo(
    () => String(params.serviceName ?? ""),
    [params.serviceName],
  );

  const serviceDurationMinutes = useMemo(
    () => String(params.serviceDurationMinutes ?? ""),
    [params.serviceDurationMinutes],
  );

  const isEdit = String(params.mode ?? "") === "edit";
  const appointmentId = useMemo(
    () => String(params.appointmentId ?? "").trim(),
    [params.appointmentId],
  );

  const currentBarberId = useMemo(
    () => String(params.currentBarberId ?? "").trim(),
    [params.currentBarberId],
  );
  const currentScheduleAt = useMemo(
    () => String(params.currentScheduleAt ?? "").trim(),
    [params.currentScheduleAt],
  );
  const currentDateISO = useMemo(
    () => String(params.currentDateISO ?? "").trim(),
    [params.currentDateISO],
  );
  const currentStartTime = useMemo(
    () => String(params.currentStartTime ?? "").trim(),
    [params.currentStartTime],
  );

  const [loading, setLoading] = useState(true);
  const [barbers, setBarbers] = useState<Barber[]>([]);

  // ✅ gate: libera quando o fetch terminar (mesmo com erro/vazio)
  const didBarbersRef = useRef(false);
  const [dataReady, setDataReady] = useState(false);

  const TOP_OFFSET = insets.top + STICKY_ROW_H;
  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );
  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const goBack = useCallback(() => router.back(), [router]);

  const goTime = useCallback(
    (b: Barber, replace?: boolean) => {
      const nav = {
        pathname: "/booking/time",
        params: {
          unitId,
          unitName,
          serviceId,
          serviceName,
          barberId: b.id,
          barberName: b.name,

          ...(serviceDurationMinutes ? { serviceDurationMinutes } : {}),

          ...(isEdit ? { mode: "edit", appointmentId } : {}),

          ...(isEdit
            ? {
                currentBarberId: currentBarberId || "",
                currentScheduleAt: currentScheduleAt || "",
                currentDateISO: currentDateISO || "",
                currentStartTime: currentStartTime || "",
              }
            : {}),
        },
      } as const;

      if (replace) router.replace(nav);
      else router.push(nav);
    },
    [
      appointmentId,
      currentBarberId,
      currentDateISO,
      currentScheduleAt,
      currentStartTime,
      isEdit,
      router,
      serviceDurationMinutes,
      serviceId,
      serviceName,
      unitId,
      unitName,
    ],
  );

  const fetchBarbers = useCallback(async () => {
    try {
      if (!unitId || !serviceId) {
        Alert.alert("Ops", "Parâmetros do agendamento estão incompletos.");
        router.back();
        return;
      }

      setLoading(true);

      const res = await api.get<BarbersResponse>(
        `/api/mobile/barbers?unitId=${encodeURIComponent(unitId)}&serviceId=${encodeURIComponent(serviceId)}`,
      );

      if ((res as any)?.error) throw new Error(String((res as any).error));

      const list: Barber[] = res?.barbers ?? [];
      setBarbers(list);
    } catch (err: any) {
      console.log(
        "[booking/professional] error:",
        err?.data ?? err?.message ?? err,
      );

      const msg = String(err?.message ?? "");
      if (msg.toLowerCase().includes("não autorizado") || err?.status === 401) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        setBarbers([]);
        return;
      }

      Alert.alert(
        "Erro",
        "Não foi possível carregar os profissionais. Tente novamente.",
      );
      setBarbers([]);
    } finally {
      setLoading(false);
      didBarbersRef.current = true;
      setDataReady(true);
    }
  }, [router, serviceId, unitId]);

  useEffect(() => {
    fetchBarbers();
  }, [fetchBarbers]);

  // ✅ bypass: se só tem 1 profissional, pula direto pro time
  useEffect(() => {
    if (loading) return;
    if (!barbers || barbers.length !== 1) return;
    goTime(barbers[0], true);
  }, [barbers, goTime, loading]);

  const key = useCallback((item: Barber) => item.id, []);
  const render = useCallback(
    ({ item, index }: ListRenderItemInfo<Barber>) => (
      <BarberRow
        item={item}
        isCurrent={!!currentBarberId && item.id === currentBarberId}
        onPress={() => goTime(item)}
        showDivider={index < barbers.length - 1}
      />
    ),
    [barbers.length, currentBarberId, goTime],
  );

  return (
    <ScreenGate
      dataReady={dataReady || didBarbersRef.current}
      skeleton={<BookingProfessionalSkeleton />}
    >
      <View style={S.page}>
        <View style={S.fixedTop}>
          <View style={safeTopStyle} />

          <View style={S.stickyRow}>
            <Pressable onPress={goBack} style={S.backBtn}>
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

        <View style={S.darkShell}>
          <View style={S.darkInner}>
            <View style={S.heroCard}>
              <Text style={S.heroTitle}>Escolha o profissional</Text>

              <Text style={S.heroDesc}>
                {unitName ? `Unidade: ${unitName}` : " "}
                {serviceName ? `\nServiço: ${serviceName}` : ""}
              </Text>

              {isEdit ? (
                <Text style={S.heroNote}>
                  Profissional atual marcado como{" "}
                  <Text style={{ fontWeight: "700" }}>Atual</Text>.{" "}
                  {currentStartTime ? (
                    <>
                      Horário atual:{" "}
                      <Text style={{ fontWeight: "700" }}>
                        {currentStartTime}
                      </Text>
                    </>
                  ) : null}
                </Text>
              ) : (
                <Text style={S.heroNote}>
                  Exibidos em ordem alfabética (sem privilégio).
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={S.whiteArea}>
          <View style={S.whiteContent}>
            <Text style={S.sectionTitle}>Profissionais</Text>

            {loading ? (
              <View style={S.centerBox}>
                <ActivityIndicator />
                <Text style={S.centerText}>Carregando…</Text>
              </View>
            ) : barbers.length === 0 ? (
              <View style={S.centerBox}>
                <Text style={S.emptyTitle}>Nenhum profissional disponível</Text>
                <Text style={S.centerText}>
                  Não encontramos profissionais ativos para esse serviço.
                </Text>

                <Pressable style={S.secondaryBtn} onPress={fetchBarbers}>
                  <Text style={S.secondaryBtnText}>Tentar novamente</Text>
                </Pressable>
              </View>
            ) : (
              <FlatList
                data={barbers}
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
    justifyContent: "space-between",
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
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
  heroNote: {
    marginTop: 10,
    color: UI.colors.text,
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.9,
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

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(124,108,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  rowTitle: { fontWeight: "700", color: UI.brand.primaryText, fontSize: 14 },
  rowMeta: { marginTop: 3, fontSize: 12, color: "rgba(0,0,0,0.55)" },

  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(124,108,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.28)",
  },
  currentBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: UI.brand.primaryText,
  },

  divider: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
});
