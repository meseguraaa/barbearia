import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
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

const STICKY_ROW_H = 74;

type DayItem = { key: string; label: string; dateISO: string };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function toISOAtNoon(d: Date) {
  const safe = new Date(d);
  safe.setHours(12, 0, 0, 0);
  return safe.toISOString();
}

function weekdayShortPt(d: Date) {
  const map = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return map[d.getDay()] ?? "Dia";
}

/**
 * Pega a "data" (YYYY-MM-DD) de um ISO usando UTC parts (evita virar dia).
 * Ex: 2025-12-20T12:00:00.000Z -> 2025-12-20
 */
function isoDayKeyUTC(dateISO: string) {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate(),
  )}`;
}

/**
 * Normaliza um horário para "HH:mm"
 * (resolve casos tipo "15:30:00", "15:30 ", "15:30:00.000")
 */
function normTime(t: string) {
  const s = String(t ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s.slice(0, 5);
  return `${pad2(Number(m[1]))}:${m[2]}`;
}

type AppointmentGetResponse = {
  ok: boolean;
  appointment: {
    id: string;
    status: string;
    scheduleAtISO: string;
    startsAtLabel: string;

    unitId: string | null;
    unitName: string | null;

    serviceId: string | null;
    serviceName: string | null;

    barberId: string | null;
    barberName: string | null;

    serviceDurationMinutes: number;

    // ✅ para preservar o slot no edit
    dateISO: string; // ISO noon -03
    startTime: string; // "HH:mm"

    canReschedule: boolean;
  };
  rules?: { canReschedule: boolean; reason: string | null };
  units?: { id: string; name: string }[];
};

const DayChip = memo(function DayChip({
  item,
  active,
  onPress,
}: {
  item: DayItem;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[S.dayChip, active ? S.dayChipActive : null]}
    >
      <Text style={[S.dayChipText, active ? S.dayChipTextActive : null]}>
        {item.label}
      </Text>
    </Pressable>
  );
});

const SlotRow = memo(function SlotRow({
  time,
  onPress,
  showDivider,
}: {
  time: string;
  onPress: () => void;
  showDivider: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={S.row}>
      <View style={S.rowLeft}>
        <View style={S.avatar}>
          <FontAwesome name="clock-o" size={18} color={UI.brand.primary} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={S.rowTitle}>{time}</Text>
          <Text style={S.rowMeta}>Toque para selecionar</Text>
        </View>
      </View>

      <FontAwesome name="chevron-right" size={14} color={UI.colors.black45} />
      {showDivider ? <View style={S.divider} /> : null}
    </Pressable>
  );
});

export default function BookingTime() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    unitId?: string;
    unitName?: string;
    serviceId?: string;
    serviceName?: string;
    barberId?: string;
    barberName?: string;

    serviceDurationMinutes?: string;

    // ✅ edit mode
    mode?: string;
    appointmentId?: string;

    // (opcional) se alguma tela já passar, usamos como fallback imediato
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
  const barberId = useMemo(
    () => String(params.barberId ?? ""),
    [params.barberId],
  );
  const barberName = useMemo(
    () => String(params.barberName ?? ""),
    [params.barberName],
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

  // ✅ estado interno do “horário original do agendamento”
  const [currentDateISO, setCurrentDateISO] = useState(
    String(params.currentDateISO ?? "").trim(),
  );
  const [currentStartTime, setCurrentStartTime] = useState(
    normTime(String(params.currentStartTime ?? "")),
  );

  const TOP_OFFSET = insets.top + STICKY_ROW_H;
  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );
  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const goBack = useCallback(() => router.back(), [router]);

  const days = useMemo<DayItem[]>(() => {
    const now = new Date();
    const list: DayItem[] = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(now, i);
      const key = dateKey(d);
      const label =
        i === 0
          ? `Hoje (${weekdayShortPt(d)})`
          : i === 1
            ? `Amanhã (${weekdayShortPt(d)})`
            : `${weekdayShortPt(d)} • ${pad2(d.getDate())}/${pad2(
                d.getMonth() + 1,
              )}`;

      list.push({ key, label, dateISO: toISOAtNoon(d) });
    }
    return list;
  }, []);

  // ✅ busca o agendamento no edit pra pegar dateISO/startTime com 100% de certeza
  const fetchCurrentAppointmentIfNeeded = useCallback(async () => {
    if (!isEdit) return;
    if (!appointmentId) return;

    try {
      const res = await api.get<AppointmentGetResponse>(
        `/api/mobile/me/appointments/${encodeURIComponent(appointmentId)}`,
      );

      if (!res?.ok || !res?.appointment) return;

      if (res.appointment.canReschedule === false) {
        Alert.alert(
          "Não é possível alterar",
          "Este agendamento não pode ser alterado agora.",
        );
        router.back();
        return;
      }

      setCurrentDateISO(String(res.appointment.dateISO ?? "").trim());
      setCurrentStartTime(normTime(String(res.appointment.startTime ?? "")));
    } catch (err: any) {
      console.log(
        "[booking/time][edit] get appointment error:",
        err?.data ?? err?.message ?? err,
      );
    }
  }, [appointmentId, isEdit, router]);

  useEffect(() => {
    fetchCurrentAppointmentIfNeeded();
  }, [fetchCurrentAppointmentIfNeeded]);

  // ✅ se estiver editando e tivermos currentDateISO, já seleciona esse dia (se estiver dentro dos 14)
  const initialSelectedDayKey = useMemo(() => {
    if (!isEdit || !currentDateISO) return days[0]?.key ?? "";
    const currentKey = isoDayKeyUTC(currentDateISO);
    const exists = days.some((d) => d.key === currentKey);
    return exists ? currentKey : (days[0]?.key ?? "");
  }, [currentDateISO, days, isEdit]);

  const [selectedDayKey, setSelectedDayKey] = useState(initialSelectedDayKey);

  useEffect(() => {
    setSelectedDayKey(initialSelectedDayKey);
  }, [initialSelectedDayKey]);

  const selectedDateISO = useMemo(
    () =>
      days.find((d) => d.key === selectedDayKey)?.dateISO ??
      days[0]?.dateISO ??
      "",
    [days, selectedDayKey],
  );

  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<string[]>([]);

  const fetchSlots = useCallback(async () => {
    try {
      if (!unitId || !serviceId || !barberId || !selectedDateISO) {
        Alert.alert("Ops", "Parâmetros do agendamento estão incompletos.");
        router.back();
        return;
      }

      setLoading(true);

      const res = await api.get<{ ok: boolean; slots: string[] }>(
        `/api/mobile/availability?barberId=${encodeURIComponent(
          barberId,
        )}&unitId=${encodeURIComponent(unitId)}&serviceId=${encodeURIComponent(
          serviceId,
        )}&dateISO=${encodeURIComponent(selectedDateISO)}${
          serviceDurationMinutes
            ? `&serviceDurationInMinutes=${encodeURIComponent(
                serviceDurationMinutes,
              )}`
            : ""
        }`,
      );

      // ✅ normaliza para garantir comparação com currentStartTime
      setSlots((res?.slots ?? []).map(normTime).filter(Boolean));
    } catch (err: any) {
      console.log("[booking/time] error:", err?.data ?? err?.message ?? err);
      setSlots([]);
      Alert.alert(
        "Erro",
        "Não foi possível carregar os horários. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    barberId,
    router,
    selectedDateISO,
    serviceId,
    unitId,
    serviceDurationMinutes,
  ]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const sameDayAsCurrent = useMemo(() => {
    if (!isEdit || !currentDateISO || !selectedDateISO) return false;
    return isoDayKeyUTC(currentDateISO) === isoDayKeyUTC(selectedDateISO);
  }, [currentDateISO, isEdit, selectedDateISO]);

  const canKeepCurrentTime = useMemo(() => {
    if (!isEdit) return false;
    if (!sameDayAsCurrent) return false;

    const t = normTime(currentStartTime);
    if (!t) return false;

    return slots.includes(t);
  }, [currentStartTime, isEdit, sameDayAsCurrent, slots]);

  const onPickTime = useCallback(
    (startTime: string) => {
      router.push({
        pathname: "/booking/details",
        params: {
          unitId,
          unitName,
          serviceId,
          serviceName,
          barberId,
          barberName,
          dateISO: selectedDateISO,
          startTime: normTime(startTime),
          serviceDurationMinutes: serviceDurationMinutes || "30",

          ...(isEdit ? { mode: "edit", appointmentId } : {}),

          ...(isEdit
            ? {
                currentDateISO: currentDateISO || "",
                currentStartTime: normTime(currentStartTime) || "",
              }
            : {}),
        },
      });
    },
    [
      appointmentId,
      barberId,
      barberName,
      currentDateISO,
      currentStartTime,
      isEdit,
      router,
      selectedDateISO,
      serviceDurationMinutes,
      serviceId,
      serviceName,
      unitId,
      unitName,
    ],
  );

  const onKeepCurrentTime = useCallback(() => {
    const t = normTime(currentStartTime);
    if (!canKeepCurrentTime || !t) return;
    onPickTime(t);
  }, [canKeepCurrentTime, currentStartTime, onPickTime]);

  const keyDay = useCallback((item: DayItem) => item.key, []);
  const renderDay = useCallback(
    ({ item }: ListRenderItemInfo<DayItem>) => (
      <DayChip
        item={item}
        active={item.key === selectedDayKey}
        onPress={() => setSelectedDayKey(item.key)}
      />
    ),
    [selectedDayKey],
  );

  const keySlot = useCallback((t: string, idx: number) => `${t}-${idx}`, []);
  const renderSlot = useCallback(
    ({ item, index }: ListRenderItemInfo<string>) => (
      <SlotRow
        time={item}
        onPress={() => onPickTime(item)}
        showDivider={index < slots.length - 1}
      />
    ),
    [onPickTime, slots.length],
  );

  return (
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
            <Text style={S.heroTitle}>Escolha o horário</Text>

            <Text style={S.heroDesc}>
              {unitName ? `Unidade: ${unitName}` : " "}
              {serviceName ? `\nServiço: ${serviceName}` : ""}
              {barberName ? `\nProfissional: ${barberName}` : ""}
            </Text>

            <Text style={S.heroNote}>
              Primeiro selecione o dia. Depois, o horário.
            </Text>
          </View>
        </View>
      </View>

      <View style={S.whiteArea}>
        <View style={S.whiteContent}>
          <Text style={S.sectionTitle}>Dia</Text>

          <FlatList
            data={days}
            keyExtractor={keyDay}
            renderItem={renderDay}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
          />

          {/* ✅ Manter horário atual (somente no editar) */}
          {isEdit && currentStartTime ? (
            <View style={{ marginTop: 6 }}>
              <Pressable
                onPress={onKeepCurrentTime}
                disabled={!canKeepCurrentTime || loading}
                style={[
                  S.keepBtn,
                  !canKeepCurrentTime || loading ? { opacity: 0.5 } : null,
                ]}
              >
                <Text style={S.keepBtnText}>
                  Manter horário atual: {normTime(currentStartTime)}
                </Text>
              </Pressable>

              {!loading && sameDayAsCurrent && !canKeepCurrentTime ? (
                <Text style={S.keepHint}>
                  Este horário não está disponível para a seleção atual.
                </Text>
              ) : null}

              {!loading && !sameDayAsCurrent ? (
                <Text style={S.keepHint}>
                  Para manter o mesmo horário, selecione o mesmo dia do
                  agendamento atual.
                </Text>
              ) : null}
            </View>
          ) : null}

          <Text style={[S.sectionTitle, { marginTop: 14 }]}>Horários</Text>

          {loading ? (
            <View style={S.centerBox}>
              <ActivityIndicator />
              <Text style={S.centerText}>Carregando…</Text>
            </View>
          ) : slots.length === 0 ? (
            <View style={S.centerBox}>
              <Text style={S.emptyTitle}>Sem horários para este dia</Text>
              <Text style={S.centerText}>
                Tente outro dia ou volte e troque o profissional.
              </Text>
            </View>
          ) : (
            <FlatList
              data={slots}
              keyExtractor={keySlot}
              renderItem={renderSlot}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 18 }}
            />
          )}
        </View>
      </View>
    </View>
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

  dayChip: {
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
    marginRight: 10,
  },
  dayChipActive: {
    backgroundColor: "rgba(124,108,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.35)",
  },
  dayChipText: { color: UI.brand.primaryText, fontWeight: "700", fontSize: 12 },
  dayChipTextActive: { color: UI.brand.primaryText },

  keepBtn: {
    height: 46,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,108,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.28)",
    paddingHorizontal: 14,
  },
  keepBtnText: { color: UI.brand.primaryText, fontWeight: "800", fontSize: 13 },
  keepHint: {
    marginTop: 8,
    color: "rgba(0,0,0,0.55)",
    fontWeight: "600",
    textAlign: "center",
  },

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

  divider: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
});
