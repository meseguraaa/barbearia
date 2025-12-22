// app/booking/time.tsx
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
import { BookingTimeSkeleton } from "../../src/components/loading/BookingTimeSkeleton";

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

/** YYYY-MM-DD via UTC parts */
function isoDayKeyUTC(dateISO: string) {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate(),
  )}`;
}

/** Normaliza pra "HH:mm" */
function normTime(t: string) {
  const s = String(t ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s.slice(0, 5);
  return `${pad2(Number(m[1]))}:${m[2]}`;
}

function timeToMinutes(hhmm: string) {
  const m = String(hhmm ?? "").match(/^(\d{2}):(\d{2})$/);
  if (!m) return Number.POSITIVE_INFINITY;
  return Number(m[1]) * 60 + Number(m[2]);
}

type AppointmentGetResponse = {
  ok: boolean;
  appointment: {
    id: string;
    status: string;

    dateISO: string; // ISO noon
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
  isCurrent,
}: {
  time: string;
  onPress: () => void;
  showDivider: boolean;
  isCurrent?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={S.row}>
      <View style={S.rowLeft}>
        <View style={S.avatar}>
          <FontAwesome name="clock-o" size={18} color={UI.brand.primary} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={S.rowTitleLine}>
            <Text style={S.rowTitle}>{time}</Text>

            {isCurrent ? (
              <View style={S.badgeAtual}>
                <Text style={S.badgeAtualText}>Atual</Text>
              </View>
            ) : null}
          </View>

          <Text style={S.rowMeta}>
            {isCurrent
              ? "Horário atual do agendamento"
              : "Toque para selecionar"}
          </Text>
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

    mode?: string;
    appointmentId?: string;

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

  const [currentDateISO, setCurrentDateISO] = useState(
    String(params.currentDateISO ?? "").trim(),
  );
  const [currentStartTime, setCurrentStartTime] = useState(
    normTime(String(params.currentStartTime ?? "")),
  );

  const [dataReady, setDataReady] = useState(false);
  const didEditFetchRef = useRef(false);
  const didSlotsFetchRef = useRef(false);

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

  const fetchCurrentAppointmentIfNeeded = useCallback(async () => {
    try {
      if (!isEdit) return;
      if (!appointmentId) return;

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
    } finally {
      didEditFetchRef.current = true;
      if (!isEdit) didEditFetchRef.current = true;
    }
  }, [appointmentId, isEdit, router]);

  useEffect(() => {
    fetchCurrentAppointmentIfNeeded();
  }, [fetchCurrentAppointmentIfNeeded]);

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

  const syncGateReady = useCallback(() => {
    if (!isEdit) {
      if (didSlotsFetchRef.current) setDataReady(true);
      return;
    }
    if (didEditFetchRef.current && didSlotsFetchRef.current) {
      setDataReady(true);
    }
  }, [isEdit]);

  const fetchSlots = useCallback(async () => {
    try {
      if (!unitId || !serviceId || !barberId || !selectedDateISO) {
        Alert.alert("Ops", "Parâmetros do agendamento estão incompletos.");
        router.back();
        return;
      }

      setLoading(true);

      const url =
        `/api/mobile/availability?barberId=${encodeURIComponent(barberId)}` +
        `&unitId=${encodeURIComponent(unitId)}` +
        `&serviceId=${encodeURIComponent(serviceId)}` +
        `&dateISO=${encodeURIComponent(selectedDateISO)}` +
        (serviceDurationMinutes
          ? `&serviceDurationInMinutes=${encodeURIComponent(
              serviceDurationMinutes,
            )}`
          : "") +
        (isEdit && appointmentId
          ? `&appointmentId=${encodeURIComponent(appointmentId)}`
          : "");

      const res = await api.get<{ ok: boolean; slots: string[] }>(url);

      const normalized = (res?.slots ?? []).map(normTime).filter(Boolean);

      // garante consistência mesmo se o backend mandar duplicado
      const uniq = Array.from(new Set(normalized)).sort(
        (a, b) => timeToMinutes(a) - timeToMinutes(b),
      );

      setSlots(uniq);
    } catch (err: any) {
      console.log("[booking/time] error:", err?.data ?? err?.message ?? err);
      setSlots([]);
      Alert.alert(
        "Erro",
        "Não foi possível carregar os horários. Tente novamente.",
      );
    } finally {
      setLoading(false);
      didSlotsFetchRef.current = true;
      syncGateReady();
    }
  }, [
    appointmentId,
    barberId,
    isEdit,
    router,
    selectedDateISO,
    serviceId,
    unitId,
    serviceDurationMinutes,
    syncGateReady,
  ]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  useEffect(() => {
    syncGateReady();
  }, [currentDateISO, currentStartTime, syncGateReady]);

  const sameDayAsCurrent = useMemo(() => {
    if (!isEdit || !currentDateISO || !selectedDateISO) return false;
    return isoDayKeyUTC(currentDateISO) === isoDayKeyUTC(selectedDateISO);
  }, [currentDateISO, isEdit, selectedDateISO]);

  // Segurança extra: se por algum motivo o backend não injetar, a gente garante no UI também.
  // ✅ Não remove os outros horários: só garante que o atual esteja presente + ordenação + sem duplicar.
  const displaySlots = useMemo(() => {
    const base = slots.slice();
    if (!isEdit) return base;

    const t = normTime(currentStartTime);
    if (!t) return base;
    if (!sameDayAsCurrent) return base;

    const merged = base.includes(t) ? base : [t, ...base];

    const uniq = Array.from(new Set(merged)).sort(
      (a, b) => timeToMinutes(a) - timeToMinutes(b),
    );

    return uniq;
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
    ({ item, index }: ListRenderItemInfo<string>) => {
      const t = normTime(item);
      const cur = normTime(currentStartTime);

      const isCurrent = !!isEdit && !!sameDayAsCurrent && !!cur && t === cur;

      return (
        <SlotRow
          time={t}
          onPress={() => onPickTime(t)}
          showDivider={index < displaySlots.length - 1}
          isCurrent={isCurrent}
        />
      );
    },
    [
      currentStartTime,
      displaySlots.length,
      isEdit,
      onPickTime,
      sameDayAsCurrent,
    ],
  );

  return (
    <ScreenGate dataReady={dataReady} skeleton={<BookingTimeSkeleton />}>
      <View style={S.page}>
        <View style={S.fixedTop}>
          <View style={safeTopStyle} />

          <View style={S.stickyRow}>
            <Pressable onPress={goBack} style={S.backBtn} hitSlop={8}>
              <FontAwesome
                name="angle-left"
                size={20}
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
              style={{ flexGrow: 0 }}
            />

            <Text style={[S.sectionTitle, { marginTop: 14 }]}>Horários</Text>

            {loading ? (
              <View style={S.centerBox}>
                <ActivityIndicator />
                <Text style={S.centerText}>Carregando…</Text>
              </View>
            ) : displaySlots.length === 0 ? (
              <View style={S.emptyInline}>
                <Text style={S.emptyTitle}>Sem horários para este dia</Text>
                <Text style={S.centerText}>
                  Tente outro dia ou volte e troque o profissional.
                </Text>
              </View>
            ) : (
              <FlatList
                data={displaySlots}
                keyExtractor={keySlot}
                renderItem={renderSlot}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={S.slotsContainer}
                style={{ flexGrow: 0 }}
              />
            )}
          </View>
        </View>
      </View>
    </ScreenGate>
  );
}

const S = StyleSheet.create({
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

  emptyInline: {
    paddingTop: 16,
    alignItems: "center",
    gap: 10,
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

  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  rowTitle: { fontWeight: "700", color: UI.brand.primaryText, fontSize: 14 },
  rowMeta: { marginTop: 3, fontSize: 12, color: "rgba(0,0,0,0.55)" },

  badgeAtual: {
    paddingHorizontal: 10,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,108,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.35)",
  },
  badgeAtualText: {
    fontSize: 11,
    fontWeight: "900",
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

  slotsContainer: {
    paddingBottom: 18,
  },
});
