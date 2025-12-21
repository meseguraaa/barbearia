import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UI } from "../../src/theme/client-theme";
import { api } from "../../src/services/api";
import { useAuth } from "../../src/auth/auth-context";

const STICKY_ROW_H = 74;

function onlyDigits(v: string) {
  return String(v ?? "").replace(/\D/g, "");
}

function formatPhoneBR(digits: string) {
  const d = onlyDigits(digits).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toMinutes(hhmm: string) {
  const [hh, mm] = String(hhmm).split(":");
  const h = Number(hh);
  const m = Number(mm);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

function fromMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/**
 * dateISO (meio-dia) + startTime ("HH:mm") -> scheduleAt ISO em São Paulo
 * Usa UTC parts do dateISO pra não “virar dia” dependendo do fuso do device.
 */
function buildScheduleAtSaoPauloISO(dateISO: string, startTime: string) {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return "";

  const yyyy = d.getUTCFullYear();
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());

  const [hh, mi] = String(startTime || "").split(":");
  if (!hh || !mi) return "";

  return `${yyyy}-${mm}-${dd}T${pad2(Number(hh))}:${pad2(Number(mi))}:00-03:00`;
}

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

    dateISO: string; // ISO noon -03
    startTime: string; // "HH:mm"

    canReschedule: boolean;
  };
};

export default function BookingDetails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const params = useLocalSearchParams<{
    unitId?: string;
    unitName?: string;
    serviceId?: string;
    serviceName?: string;
    serviceDurationMinutes?: string;
    barberId?: string;
    barberName?: string;

    // ✅ selecionado no fluxo (novo)
    dateISO?: string;
    startTime?: string;

    // ✅ edit mode
    mode?: string;
    appointmentId?: string;

    // ✅ contexto do horário original
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

  const isEdit = useMemo(() => String(params.mode ?? "") === "edit", [params]);
  const appointmentId = useMemo(
    () => String(params.appointmentId ?? "").trim(),
    [params.appointmentId],
  );

  // ✅ horário “novo” (se usuário escolheu no fluxo)
  const pickedDateISO = useMemo(
    () => String(params.dateISO ?? "").trim(),
    [params.dateISO],
  );
  const pickedStartTime = useMemo(
    () => String(params.startTime ?? "").trim(),
    [params.startTime],
  );

  // ✅ horário “atual” (fallback do params, mas vamos garantir via GET também)
  const [currentDateISO, setCurrentDateISO] = useState(
    String(params.currentDateISO ?? "").trim(),
  );
  const [currentStartTime, setCurrentStartTime] = useState(
    String(params.currentStartTime ?? "").trim(),
  );

  // ✅ no edit: garante que sempre teremos o horário original mesmo se params vierem vazios
  const fetchCurrentIfNeeded = useCallback(async () => {
    if (!isEdit) return;
    if (!appointmentId) return;

    // se já temos os dois, não precisa bater
    if (currentDateISO && currentStartTime) return;

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
      setCurrentStartTime(String(res.appointment.startTime ?? "").trim());
    } catch (err: any) {
      console.log(
        "[booking/details][edit] get appointment error:",
        err?.data ?? err?.message ?? err,
      );
      // não bloqueia já de cara; a validação abaixo vai pegar se faltar horário
    }
  }, [appointmentId, currentDateISO, currentStartTime, isEdit, router]);

  useEffect(() => {
    fetchCurrentIfNeeded();
  }, [fetchCurrentIfNeeded]);

  // ✅ fonte final do horário:
  // - create: usa o picked (obrigatório)
  // - edit: usa picked se vier; senão preserva current
  const effectiveDateISO = useMemo(() => {
    if (!isEdit) return pickedDateISO;
    return pickedDateISO || currentDateISO;
  }, [currentDateISO, isEdit, pickedDateISO]);

  const effectiveStartTime = useMemo(() => {
    if (!isEdit) return pickedStartTime;
    return pickedStartTime || currentStartTime;
  }, [currentStartTime, isEdit, pickedStartTime]);

  const serviceDurationMin = useMemo(() => {
    const raw = Number(params.serviceDurationMinutes ?? "");
    return Number.isFinite(raw) && raw > 0 ? raw : 30;
  }, [params.serviceDurationMinutes]);

  const endTime = useMemo(() => {
    const st = toMinutes(effectiveStartTime);
    if (!Number.isFinite(st)) return "";
    return fromMinutes(st + serviceDurationMin);
  }, [effectiveStartTime, serviceDurationMin]);

  const TOP_OFFSET = insets.top + STICKY_ROW_H;
  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );
  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientName && (user?.name || user?.email)) {
      setClientName(String(user?.name || user?.email || ""));
    }
    if (!phone && user?.phone) {
      setPhone(onlyDigits(String(user.phone)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name, user?.email, user?.phone]);

  const goBack = useCallback(() => router.back(), [router]);

  const dateLabel = useMemo(() => {
    const d = new Date(effectiveDateISO);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }, [effectiveDateISO]);

  const scheduleAt = useMemo(
    () => buildScheduleAtSaoPauloISO(effectiveDateISO, effectiveStartTime),
    [effectiveDateISO, effectiveStartTime],
  );

  const confirm = useCallback(async () => {
    try {
      // ✅ valida parâmetros base
      if (!unitId || !serviceId || !barberId) {
        Alert.alert(
          "Ops",
          "Seu agendamento está incompleto. Volte e tente novamente.",
        );
        return;
      }

      // ✅ valida horário efetivo (create precisa, edit pode preservar)
      if (!effectiveDateISO || !effectiveStartTime || !scheduleAt) {
        Alert.alert(
          "Ops",
          isEdit
            ? "Não encontramos o horário atual para preservar. Volte e tente novamente."
            : "Selecione um horário para continuar.",
        );
        return;
      }

      if (isEdit && !appointmentId) {
        Alert.alert("Ops", "appointmentId ausente no modo alterar.");
        return;
      }

      const name = clientName.trim();
      const digits = onlyDigits(phone);

      if (!name) {
        Alert.alert("Faltou o nome", "Digite seu nome para confirmar.");
        return;
      }

      if (!(digits.length === 10 || digits.length === 11)) {
        Alert.alert("Telefone inválido", "Use DDD + número.");
        return;
      }

      setSaving(true);

      if (isEdit) {
        // ✅ ALTERAR: usa PATCH no endpoint do route.ts que você mandou
        const payload = {
          unitId,
          serviceId,
          barberId,
          scheduleAt,
        };

        if (__DEV__) {
          console.log(
            `[booking/details] PATCH /api/mobile/me/appointments/${appointmentId} payload:`,
            payload,
          );
        }

        await api.patch(
          `/api/mobile/me/appointments/${encodeURIComponent(appointmentId)}`,
          payload,
        );

        Alert.alert(
          "Alterado! ✅",
          "Seu agendamento foi atualizado com sucesso.",
          [{ text: "Ok", onPress: () => router.replace("/(app)/(tabs)/home") }],
        );
        return;
      }

      // ✅ CRIAR
      const payload = {
        clientName: name,
        phone: digits,
        description: serviceName || "Agendamento",
        unitId,
        serviceId,
        barberId,
        scheduleAt,
        dateISO: effectiveDateISO,
        startTime: effectiveStartTime,
      };

      if (__DEV__) {
        console.log(
          "[booking/details] POST /api/mobile/appointments payload:",
          payload,
        );
      }

      await api.post("/api/mobile/appointments", payload);

      Alert.alert("Agendado! ✅", "Seu horário foi reservado com sucesso.", [
        { text: "Ok", onPress: () => router.replace("/(app)/(tabs)/home") },
      ]);
    } catch (err: any) {
      console.log("[booking/details] error:", err?.data ?? err?.message ?? err);

      const status = err?.status;
      const serverMsg = err?.data?.error;

      if (
        isEdit &&
        (status === 409 ||
          String(serverMsg || "")
            .toLowerCase()
            .includes("dispon"))
      ) {
        Alert.alert(
          "Horário indisponível",
          "Esse horário acabou de ser ocupado. Escolha outro.",
        );
        return;
      }

      Alert.alert(
        "Erro",
        serverMsg ||
          err?.message ||
          (isEdit
            ? "Não foi possível alterar o agendamento."
            : "Não foi possível confirmar o agendamento."),
      );
    } finally {
      setSaving(false);
    }
  }, [
    appointmentId,
    barberId,
    clientName,
    effectiveDateISO,
    effectiveStartTime,
    isEdit,
    phone,
    router,
    scheduleAt,
    serviceId,
    serviceName,
    unitId,
  ]);

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
            <Text style={S.heroTitle}>Seus dados</Text>

            <Text style={S.heroDesc}>
              {unitName ? `Unidade: ${unitName}` : " "}
              {serviceName ? `\nServiço: ${serviceName}` : ""}
              {barberName ? `\nProfissional: ${barberName}` : ""}
              {dateLabel && effectiveStartTime
                ? `\nData: ${dateLabel} • ${effectiveStartTime}${
                    endTime ? ` - ${endTime}` : ""
                  }`
                : ""}
            </Text>

            <Text style={S.heroNote}>
              {isEdit
                ? "Ajuste e confirme. Troca feita com estilo 😎"
                : "Preencha e confirme. Sem formulário infinito 😎"}
            </Text>
          </View>
        </View>
      </View>

      <View style={S.whiteArea}>
        <KeyboardAvoidingView
          style={S.whiteContent}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Text style={S.sectionTitle}>Nome</Text>
          <View style={S.inputWrap}>
            <TextInput
              value={clientName}
              onChangeText={setClientName}
              placeholder="Seu nome"
              placeholderTextColor="rgba(0,0,0,0.35)"
              style={S.input}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <Text style={[S.sectionTitle, { marginTop: 14 }]}>Telefone</Text>
          <View style={S.inputWrap}>
            <TextInput
              value={formatPhoneBR(phone)}
              onChangeText={(v) => setPhone(onlyDigits(v))}
              placeholder="(11) 99999-9999"
              placeholderTextColor="rgba(0,0,0,0.35)"
              style={S.input}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
          </View>

          <Pressable
            style={[S.primaryBtn, saving ? { opacity: 0.8 } : null]}
            onPress={confirm}
            disabled={saving}
          >
            {saving ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <ActivityIndicator />
                <Text style={S.primaryBtnText}>
                  {isEdit ? "Alterando…" : "Confirmando…"}
                </Text>
              </View>
            ) : (
              <Text style={S.primaryBtnText}>
                {isEdit ? "Confirmar alteração" : "Confirmar agendamento"}
              </Text>
            )}
          </Pressable>

          <Pressable style={S.secondaryBtn} onPress={goBack} disabled={saving}>
            <Text style={S.secondaryBtnText}>Voltar</Text>
          </Pressable>
        </KeyboardAvoidingView>
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
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
    color: UI.brand.primaryText,
  },

  inputWrap: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.05)",
    paddingHorizontal: 14,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  input: { fontSize: 15, fontWeight: "600", color: UI.brand.primaryText },

  primaryBtn: {
    marginTop: 18,
    height: 56,
    backgroundColor: UI.brand.primary,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
  },
  primaryBtnText: { color: UI.colors.text, fontSize: 15, fontWeight: "700" },

  secondaryBtn: {
    marginTop: 10,
    height: 52,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryBtnText: { color: UI.brand.primaryText, fontWeight: "700" },
});
