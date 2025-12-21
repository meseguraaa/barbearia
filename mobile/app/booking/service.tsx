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

type Service = {
  id: string;
  name: string;
  durationMinutes?: number | null;
  priceLabel?: string | null;
  price?: any; // Prisma Decimal pode vir como string/number
};

type EditPayload = {
  ok: boolean;
  appointment: {
    id: string;
    unitId: string | null;
    unitName: string | null;
    serviceId: string | null;
    serviceName: string | null;
    barberId: string | null;
    barberName: string | null;
    scheduleAt: string | Date;
    status: string;
  };
  units: { id: string; name: string }[];
  rules: { canReschedule: boolean; reason: string | null };
};

function formatMoneyBRL(value: any): string | null {
  if (value == null) return null;

  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : typeof value?.toNumber === "function"
          ? value.toNumber()
          : Number(value);

  if (Number.isNaN(n)) return null;

  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizeDurationMinutes(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.round(n);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Converte scheduleAt (ISO) em:
 * - dateISO ao meio-dia (pra usar no seu padrão do BookingTime)
 * - startTime HH:mm
 *
 * Observação: a gente usa os campos "locais" do Date (getFullYear etc)
 * porque scheduleAt já vem com offset do servidor.
 */
function splitScheduleAt(scheduleAt: string | Date): {
  dateISO: string;
  startTime: string;
} {
  const d = new Date(scheduleAt);
  if (Number.isNaN(d.getTime())) return { dateISO: "", startTime: "" };

  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());

  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());

  // dateISO "safe" ao meio-dia
  const noon = new Date(d);
  noon.setHours(12, 0, 0, 0);

  return {
    dateISO: noon.toISOString(),
    startTime: `${hh}:${mi}`,
  };
}

const ServiceRow = memo(function ServiceRow({
  item,
  onPress,
  showDivider,
  isCurrent,
}: {
  item: Service;
  onPress: () => void;
  showDivider: boolean;
  isCurrent: boolean;
}) {
  const price = useMemo(() => {
    if (item.priceLabel) return item.priceLabel;
    const f = formatMoneyBRL(item.price);
    return f ?? "";
  }, [item.price, item.priceLabel]);

  const duration = useMemo(() => {
    const m = item.durationMinutes ?? null;
    if (!m || m <= 0) return "";
    return `${m} min`;
  }, [item.durationMinutes]);

  return (
    <Pressable onPress={onPress} style={S.row}>
      <View style={S.rowLeft}>
        <View style={S.avatar}>
          <FontAwesome name="scissors" size={16} color={UI.brand.primary} />
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

          <Text style={S.rowMeta} numberOfLines={1}>
            {duration ? duration : "Toque para escolher"}
          </Text>
        </View>
      </View>

      <View style={S.rowRight}>
        {price ? <Text style={S.rowPrice}>{price}</Text> : null}
        <FontAwesome name="chevron-right" size={14} color={UI.colors.black45} />
      </View>

      {showDivider ? <View style={S.divider} /> : null}
    </Pressable>
  );
});

export default function BookingService() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    unitId?: string;
    unitName?: string;

    mode?: string;
    appointmentId?: string;
  }>();

  const unitId = useMemo(() => String(params.unitId ?? ""), [params.unitId]);
  const unitName = useMemo(
    () => String(params.unitName ?? ""),
    [params.unitName],
  );

  const isEdit = String(params.mode ?? "") === "edit";
  const appointmentId = useMemo(
    () => String(params.appointmentId ?? "").trim(),
    [params.appointmentId],
  );

  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);

  // ✅ dados do agendamento atual (modo editar)
  const [currentServiceId, setCurrentServiceId] = useState<string | null>(null);
  const [currentBarberId, setCurrentBarberId] = useState<string | null>(null);
  const [currentScheduleAt, setCurrentScheduleAt] = useState<string>("");

  // ✅ derivados do scheduleAt (pra preservar horário)
  const [currentDateISO, setCurrentDateISO] = useState<string>("");
  const [currentStartTime, setCurrentStartTime] = useState<string>("");

  const TOP_OFFSET = insets.top + STICKY_ROW_H;
  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );
  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const goBack = useCallback(() => router.back(), [router]);

  const fetchEditInfoIfNeeded = useCallback(async () => {
    if (!isEdit) return;

    if (!appointmentId) {
      Alert.alert("Ops", "appointmentId ausente no modo editar.");
      router.back();
      return;
    }

    const res = await api.get<EditPayload>(
      `/api/mobile/me/appointments/${appointmentId}/edit`,
    );

    if (!res?.ok) {
      Alert.alert("Erro", "Não foi possível validar a edição.");
      router.back();
      return;
    }

    if (res.rules?.canReschedule === false) {
      Alert.alert("Não é possível alterar", res.rules?.reason || "Bloqueado.");
      router.back();
      return;
    }

    const appt = res.appointment;
    const scheduleAtStr =
      appt?.scheduleAt instanceof Date
        ? appt.scheduleAt.toISOString()
        : String(appt?.scheduleAt ?? "");

    setCurrentServiceId(appt?.serviceId ?? null);
    setCurrentBarberId(appt?.barberId ?? null);
    setCurrentScheduleAt(scheduleAtStr);

    const { dateISO, startTime } = splitScheduleAt(scheduleAtStr);
    setCurrentDateISO(dateISO);
    setCurrentStartTime(startTime);
  }, [appointmentId, isEdit, router]);

  const fetchServices = useCallback(async () => {
    if (!unitId) {
      Alert.alert("Ops", "Unidade não informada. Volte e tente novamente.");
      router.back();
      return;
    }

    setLoading(true);

    try {
      const res = await api.get<{ ok?: boolean; services?: Service[] }>(
        `/api/mobile/services?unitId=${encodeURIComponent(unitId)}`,
      );

      const list = (res?.services ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));

      setServices(list);
    } catch (err: any) {
      console.log("[booking/service] error:", err?.data ?? err?.message ?? err);
      Alert.alert(
        "Erro",
        "Não foi possível carregar os serviços. Tente novamente.",
      );
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [router, unitId]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (isEdit) await fetchEditInfoIfNeeded();
      } catch (err: any) {
        if (!alive) return;
        console.log(
          "[booking/service][edit] error:",
          err?.data ?? err?.message ?? err,
        );
        const msg =
          err?.data?.error ||
          err?.message ||
          "Não foi possível validar a edição do agendamento.";
        Alert.alert("Erro", msg);
        router.back();
        return;
      }

      if (alive) await fetchServices();
    })();

    return () => {
      alive = false;
    };
  }, [fetchEditInfoIfNeeded, fetchServices, isEdit, router]);

  const pushProfessional = useCallback(
    (s: Service, replace?: boolean) => {
      const duration = normalizeDurationMinutes(s.durationMinutes);

      const nav = {
        pathname: "/booking/professional",
        params: {
          unitId,
          unitName,
          serviceId: s.id,
          serviceName: s.name,
          serviceDurationMinutes: String(duration),

          ...(isEdit
            ? {
                mode: "edit",
                appointmentId,

                // ✅ contexto do agendamento atual (pra preservar horário depois)
                currentServiceId: currentServiceId ?? "",
                currentBarberId: currentBarberId ?? "",
                currentScheduleAt: currentScheduleAt ?? "",
                currentDateISO: currentDateISO ?? "",
                currentStartTime: currentStartTime ?? "",
              }
            : {}),
        },
      } as const;

      if (__DEV__) {
        console.log("[booking/service] pick:", {
          serviceId: s.id,
          serviceName: s.name,
          duration,
          isEdit,
          appointmentId: isEdit ? appointmentId : undefined,
          currentDateISO,
          currentStartTime,
        });
      }

      if (replace) router.replace(nav);
      else router.push(nav);
    },
    [
      appointmentId,
      currentBarberId,
      currentDateISO,
      currentScheduleAt,
      currentServiceId,
      currentStartTime,
      isEdit,
      router,
      unitId,
      unitName,
    ],
  );

  useEffect(() => {
    if (loading) return;
    if (!services || services.length !== 1) return;

    pushProfessional(services[0], true);
  }, [loading, pushProfessional, services]);

  const goProfessional = useCallback(
    (s: Service) => pushProfessional(s, false),
    [pushProfessional],
  );

  const key = useCallback((item: Service) => item.id, []);
  const render = useCallback(
    ({ item, index }: ListRenderItemInfo<Service>) => (
      <ServiceRow
        item={item}
        isCurrent={!!currentServiceId && item.id === currentServiceId}
        onPress={() => goProfessional(item)}
        showDivider={index < services.length - 1}
      />
    ),
    [currentServiceId, goProfessional, services.length],
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
            <Text style={S.heroTitle}>Escolha o serviço</Text>

            <Text style={S.heroDesc}>
              {unitName ? `Unidade: ${unitName}` : " "}
            </Text>

            {isEdit ? (
              <Text style={S.heroNote}>
                Serviço atual marcado como{" "}
                <Text style={{ fontWeight: "700" }}>Atual</Text>. Horário atual:{" "}
                <Text style={{ fontWeight: "700" }}>
                  {currentStartTime || "--:--"}
                </Text>
              </Text>
            ) : (
              <Text style={S.heroNote}>Exibidos em ordem alfabética.</Text>
            )}
          </View>
        </View>
      </View>

      <View style={S.whiteArea}>
        <View style={S.whiteContent}>
          <Text style={S.sectionTitle}>Serviços</Text>

          {loading ? (
            <View style={S.centerBox}>
              <ActivityIndicator />
              <Text style={S.centerText}>Carregando…</Text>
            </View>
          ) : services.length === 0 ? (
            <View style={S.centerBox}>
              <Text style={S.emptyTitle}>Nenhum serviço disponível</Text>
              <Text style={S.centerText}>
                Não encontramos serviços ativos para essa unidade.
              </Text>

              <Pressable style={S.secondaryBtn} onPress={fetchServices}>
                <Text style={S.secondaryBtnText}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={services}
              keyExtractor={key}
              renderItem={render}
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

  rowRight: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: 12,
  },

  rowPrice: {
    color: UI.brand.primaryText,
    fontWeight: "700",
    fontSize: 13,
  },

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
