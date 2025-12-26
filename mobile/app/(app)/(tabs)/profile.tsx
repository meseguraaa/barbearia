import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  InputAccessoryView,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { UI, styles } from "../../../src/theme/client-theme";
import { useAuth } from "../../../src/auth/auth-context";
import { apiFetch } from "../../../src/lib/api";

import { ScreenGate } from "../../../src/components/layout/ScreenGate";
import { ProfileSkeleton } from "../../../src/components/loading/ProfileSkeleton";

const STICKY_ROW_H = 74;
const IOS_ACCESSORY_ID = "profileEmptyAccessory";

const AVATAR_PLACEHOLDER = "https://i.pravatar.cc/200?img=12";

/* ===========================
 * Máscaras (sem libs)
 * ===========================*/
function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length === 0) return "";

  if (digits.length <= 10) {
    const m = digits
      .replace(/(\d{0,2})(\d{0,4})(\d{0,4}).*/, "($1) $2-$3")
      .replace(/\(\)\s?/, "")
      .replace(/\)\s-/, ") ")
      .replace(/-$/, "");
    return m.trim();
  }

  const m = digits
    .replace(/(\d{0,2})(\d{0,5})(\d{0,4}).*/, "($1) $2-$3")
    .replace(/\(\)\s?/, "")
    .replace(/\)\s-/, ") ")
    .replace(/-$/, "");
  return m.trim();
}

function maskDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length === 0) return "";

  let out = digits;
  if (digits.length >= 3) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length >= 5)
    out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;

  return out;
}

function formatBirthdayBR(input: unknown): string {
  if (!input) return "";

  const d =
    input instanceof Date
      ? input
      : typeof input === "string"
        ? new Date(input)
        : null;

  if (!d || Number.isNaN(d.getTime())) return "";

  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

function isValidBirthBR(b: string) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(b)) return false;

  const [ddS, mmS, yyyyS] = b.split("/");
  const dd = Number(ddS);
  const mm = Number(mmS);
  const yyyy = Number(yyyyS);

  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy))
    return false;
  if (yyyy < 1900 || yyyy > 2100) return false;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;

  // valida data real
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (Number.isNaN(d.getTime())) return false;
  if (
    d.getUTCFullYear() !== yyyy ||
    d.getUTCMonth() !== mm - 1 ||
    d.getUTCDate() !== dd
  )
    return false;

  return true;
}

type MeApiUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  phone: string | null;
  birthday: string | Date | null;

  // ✅ novo (backend /me)
  profileComplete?: boolean;
  missingFields?: Array<"phone" | "birthday">;
};

// =======================
// 🎨 NÍVEL DO CLIENTE (cores copiadas do Admin)
// =======================
type CustomerLevelKey = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

function normalizeCustomerLevelKey(user: any): CustomerLevelKey | null {
  const raw = String(
    user?.customerLevel?.key ??
      user?.customerLevel?.level ??
      user?.customerLevel?.value ??
      user?.customerLevel ??
      user?.level?.key ??
      user?.level?.value ??
      user?.level ??
      user?.levelKey ??
      user?.levelEnum ??
      "",
  ).trim();

  if (
    raw === "BRONZE" ||
    raw === "PRATA" ||
    raw === "OURO" ||
    raw === "DIAMANTE"
  )
    return raw;

  const label = String(
    user?.customerLevel?.label ??
      user?.level?.label ??
      user?.levelLabel ??
      user?.tier?.label ??
      user?.tier ??
      "",
  )
    .trim()
    .toLowerCase();

  if (label.includes("bronze")) return "BRONZE";
  if (label.includes("prata")) return "PRATA";
  if (label.includes("ouro")) return "OURO";
  if (label.includes("diam")) return "DIAMANTE";

  return null;
}

function levelChipColors(level: CustomerLevelKey) {
  switch (level) {
    case "BRONZE":
      return {
        bg: "rgba(245, 158, 11, 0.10)", // amber-500/10
        border: "rgba(245, 158, 11, 0.30)", // amber-500/30
        text: "rgb(180, 83, 9)", // amber-700
      };
    case "PRATA":
      return {
        bg: "rgba(100, 116, 139, 0.10)", // slate-500/10
        border: "rgba(100, 116, 139, 0.30)", // slate-500/30
        text: "rgb(226, 232, 240)", // slate-200
      };
    case "OURO":
      return {
        bg: "rgba(234, 179, 8, 0.10)", // yellow-500/10
        border: "rgba(234, 179, 8, 0.30)", // yellow-500/30
        text: "rgb(161, 98, 7)", // yellow-700 (aprox)
      };
    case "DIAMANTE":
      return {
        bg: "rgba(14, 165, 233, 0.10)", // sky-500/10
        border: "rgba(14, 165, 233, 0.30)", // sky-500/30
        text: "rgb(3, 105, 161)", // sky-700
      };
  }
}

const Field = memo(function Field({
  label,
  value,
  placeholder,
  icon,
  editable,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value?: string;
  placeholder: string;
  icon: any;
  editable?: boolean;
  onChangeText?: (t: string) => void;
  keyboardType?: any;
}) {
  return (
    <View style={S.fieldWrap}>
      <Text style={S.fieldLabel}>{label}</Text>

      <View style={S.inputRow}>
        <View style={S.inputIcon}>
          <FontAwesome name={icon} size={16} color={UI.brand.primary} />
        </View>

        <TextInput
          value={value}
          placeholder={placeholder}
          placeholderTextColor={UI.colors.black45}
          style={S.input}
          editable={editable}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          inputAccessoryViewID={
            Platform.OS === "ios" ? IOS_ACCESSORY_ID : undefined
          }
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
    </View>
  );
});

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();

  const [loadingMe, setLoadingMe] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState(AVATAR_PLACEHOLDER);

  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");

  // ✅ onboarding gate
  const [profileComplete, setProfileComplete] = useState<boolean>(true);
  const [missingFields, setMissingFields] = useState<
    Array<"phone" | "birthday">
  >([]);

  const didMeRef = useRef(false);
  const [dataReady, setDataReady] = useState(false);

  const TOP_OFFSET = insets.top + STICKY_ROW_H;
  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );

  const scrollContentStyle = useMemo(
    () => [S.scrollContent, { paddingBottom: 28 + insets.bottom }],
    [insets.bottom],
  );

  // ✅ nível (label curta) + cores do Admin
  const { user } = useAuth();

  const userLevelLabel = useMemo(() => {
    const raw =
      (user as any)?.level?.label ??
      (user as any)?.levelLabel ??
      (user as any)?.level ??
      (user as any)?.customerLevel?.label ??
      (user as any)?.customerLevel ??
      (user as any)?.tier?.label ??
      (user as any)?.tier ??
      null;

    const s = String(raw ?? "").trim();
    if (!s) return null;

    return s.length > 12 ? `${s.slice(0, 12)}…` : s;
  }, [user]);

  const userLevelIcon = useMemo(() => {
    const l = String(userLevelLabel ?? "").toLowerCase();
    if (l.includes("diam")) return "diamond";
    if (l.includes("ouro")) return "trophy";
    if (l.includes("prata")) return "certificate";
    return "star";
  }, [userLevelLabel]);

  const userLevelKey = useMemo(() => normalizeCustomerLevelKey(user), [user]);

  const userLevelStyle = useMemo(() => {
    if (!userLevelKey) return null;
    const c = levelChipColors(userLevelKey);

    return {
      container: {
        backgroundColor: c.bg,
        borderColor: c.border,
      },
      text: {
        color: c.text,
      },
      icon: {
        color: c.text,
      },
    } as const;
  }, [userLevelKey]);

  const needsOnboarding = useMemo(() => !profileComplete, [profileComplete]);

  const onboardingTitle = useMemo(() => {
    const fields = missingFields || [];
    const hasPhone = fields.includes("phone");
    const hasBirth = fields.includes("birthday");

    if (hasPhone && hasBirth) return "Complete seu cadastro";
    if (hasPhone) return "Falta seu telefone";
    if (hasBirth) return "Falta sua data de nascimento";
    return "Complete seu cadastro";
  }, [missingFields]);

  const onboardingText = useMemo(() => {
    const fields = missingFields || [];
    const parts: string[] = [];

    if (fields.includes("phone")) parts.push("telefone");
    if (fields.includes("birthday")) parts.push("data de nascimento");

    if (parts.length === 0) {
      return "Para continuar usando o app, complete seu cadastro.";
    }

    return `Para continuar usando o app, informe ${parts.join(" e ")}.`;
  }, [missingFields]);

  async function forceLogoutToLogin() {
    try {
      await signOut();
    } finally {
      router.replace("/(auth)/login");
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingMe(true);

        const res = await apiFetch<{
          user: MeApiUser;
          profileComplete?: boolean;
        }>("/api/mobile/me");
        if (!alive) return;

        const u = res.user;

        setName(u.name ?? "");
        setEmail(u.email ?? "");
        setAvatar(u.image?.trim() ? u.image : AVATAR_PLACEHOLDER);

        setPhone(u.phone ? maskPhone(u.phone) : "");
        setBirth(maskDate(formatBirthdayBR(u.birthday)));

        // ✅ gate
        const pc =
          typeof u.profileComplete === "boolean"
            ? u.profileComplete
            : typeof (res as any)?.profileComplete === "boolean"
              ? Boolean((res as any).profileComplete)
              : true;

        setProfileComplete(pc);
        setMissingFields(Array.isArray(u.missingFields) ? u.missingFields : []);
      } catch {
        Alert.alert("Erro", "Não foi possível carregar seus dados.");
        setAvatar(AVATAR_PLACEHOLDER);
      } finally {
        if (!alive) return;
        setLoadingMe(false);

        if (!didMeRef.current) {
          didMeRef.current = true;
          setDataReady(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function handleLogout() {
    Alert.alert("Sair da conta", "Quer mesmo sair?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: forceLogoutToLogin },
    ]);
  }

  function validateRequiredForOnboarding() {
    const pDigits = digitsOnly(phone);
    const b = birth.trim();

    // telefone: mínimo razoável pra BR (DDD + 8/9 dígitos)
    if (!pDigits || pDigits.length < 10) {
      Alert.alert(
        "Telefone obrigatório",
        "Informe um telefone válido para continuar.",
      );
      return false;
    }

    if (!b || !isValidBirthBR(b)) {
      Alert.alert(
        "Data de nascimento obrigatória",
        "Informe sua data no formato dd/mm/aaaa para continuar.",
      );
      return false;
    }

    return true;
  }

  async function handleSave() {
    if (saving) return;

    const b = birth.trim();

    // Se está em onboarding, vira obrigatório.
    if (needsOnboarding) {
      if (!validateRequiredForOnboarding()) return;
    } else {
      // Fora onboarding, só valida se preencheu algo
      if (b.length > 0 && !/^\d{2}\/\d{2}\/\d{4}$/.test(b)) {
        Alert.alert("Data inválida", "Use o formato 00/00/0000.");
        return;
      }
      if (b.length > 0 && !isValidBirthBR(b)) {
        Alert.alert("Data inválida", "Verifique o dia/mês/ano.");
        return;
      }
    }

    try {
      setSaving(true);

      const res = await apiFetch<{ user: any; profileComplete?: boolean }>(
        "/api/mobile/me",
        {
          method: "PATCH",
          body: JSON.stringify({
            phone: phone.trim() || null,
            birthday: b || null,
          }),
        },
      );

      const u = (res as any)?.user ?? null;

      const pc =
        typeof u?.profileComplete === "boolean"
          ? u.profileComplete
          : typeof (res as any)?.profileComplete === "boolean"
            ? Boolean((res as any).profileComplete)
            : true;

      setProfileComplete(pc);
      setMissingFields(Array.isArray(u?.missingFields) ? u.missingFields : []);

      if (!pc) {
        Alert.alert(
          "Cadastro incompleto",
          "Preencha telefone e data de nascimento para continuar.",
        );
        return;
      }

      router.replace("/(app)/(tabs)/home");
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenGate dataReady={dataReady} skeleton={<ProfileSkeleton />}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? STICKY_ROW_H : 0}
      >
        <View style={S.page}>
          {Platform.OS === "ios" ? (
            <InputAccessoryView nativeID={IOS_ACCESSORY_ID}>
              <View />
            </InputAccessoryView>
          ) : null}

          {/* TOPO FIXO */}
          <View style={S.fixedTop}>
            <View style={safeTopStyle} />
            <View style={S.stickyRow}>
              <Text style={S.title}>Perfil</Text>
            </View>
          </View>

          <ScrollView
            style={S.scroll}
            contentContainerStyle={scrollContentStyle}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            {...(Platform.OS === "ios"
              ? ({ automaticallyAdjustKeyboardInsets: true } as any)
              : null)}
          >
            <View
              pointerEvents="none"
              style={[S.topBounceDark, { height: topBounceHeight }]}
            />

            <View
              style={{ height: TOP_OFFSET, backgroundColor: UI.colors.bg }}
            />

            {/* BLOCO ESCURO */}
            <View style={S.darkShell}>
              <View style={S.darkInner}>
                {/* ✅ Card igual ao heroCard da Home */}
                <View style={S.heroCard}>
                  <View style={S.profileHeroRow}>
                    <View style={S.avatarWrap}>
                      <Image source={{ uri: avatar }} style={S.avatarBig} />
                      <View style={S.avatarBadge}>
                        <FontAwesome
                          name="user"
                          size={12}
                          color={UI.colors.white}
                        />
                      </View>
                    </View>

                    <View style={S.heroTextCol}>
                      <Text style={S.heroHello}>
                        Seus dados{loadingMe ? "…" : ""}
                      </Text>
                      <Text style={S.heroName} numberOfLines={1}>
                        {name || " "}
                      </Text>
                      <Text style={S.heroEmail} numberOfLines={1}>
                        {email || " "}
                      </Text>
                    </View>

                    {userLevelLabel ? (
                      <View
                        style={[
                          S.levelPill,
                          S.levelPillRight,
                          userLevelStyle?.container,
                        ]}
                      >
                        <FontAwesome
                          name={userLevelIcon as any}
                          size={14}
                          color={userLevelStyle?.icon?.color ?? UI.colors.white}
                        />
                        <Text
                          style={[S.levelPillText, userLevelStyle?.text]}
                          numberOfLines={1}
                        >
                          {userLevelLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            {/* ÁREA BRANCA */}
            <View style={S.whiteArea}>
              <View style={S.whiteContent}>
                {needsOnboarding ? (
                  <View style={S.onboardingCard}>
                    <View style={S.onboardingIcon}>
                      <FontAwesome
                        name="exclamation"
                        size={14}
                        color={UI.brand.primaryText}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.onboardingTitle}>{onboardingTitle}</Text>
                      <Text style={S.onboardingText}>{onboardingText}</Text>
                    </View>
                  </View>
                ) : null}

                <Text style={S.sectionTitle}>Informações</Text>

                <View style={S.formCard}>
                  <Field
                    label="Nome"
                    value={name}
                    placeholder="Seu nome completo"
                    icon="user"
                    editable={false}
                  />

                  <Field
                    label="E-mail"
                    value={email}
                    placeholder="seu@email.com"
                    icon="envelope"
                    editable={false}
                  />

                  <Field
                    label="Telefone"
                    value={phone}
                    placeholder="(00) 00000-0000"
                    icon="phone"
                    editable={!loadingMe && !saving}
                    onChangeText={(t) => setPhone(maskPhone(t))}
                    keyboardType="number-pad"
                  />

                  <Field
                    label="Data de nascimento"
                    value={birth}
                    placeholder="dd/mm/aaaa"
                    icon="calendar"
                    editable={!loadingMe && !saving}
                    onChangeText={(t) => setBirth(maskDate(t))}
                    keyboardType="number-pad"
                  />
                </View>

                <Pressable
                  style={[
                    S.saveBtn,
                    needsOnboarding ? S.saveBtnOnboarding : null,
                    saving || loadingMe ? { opacity: 0.85 } : null,
                  ]}
                  onPress={handleSave}
                  disabled={saving || loadingMe}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={S.saveBtnText}>
                      {needsOnboarding
                        ? "Completar cadastro"
                        : "Salvar alterações"}
                    </Text>
                  )}
                </Pressable>

                <Pressable style={S.dangerLink} onPress={handleLogout}>
                  <Text style={S.dangerText}>Sair da conta</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    justifyContent: "center",
  },

  title: {
    color: UI.colors.text,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  scroll: { flex: 1, backgroundColor: UI.colors.white },
  scrollContent: { paddingBottom: 28 },

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

  /* ✅ HERO (igual Home) */
  heroCard: {
    marginTop: 14,
    backgroundColor: "rgba(124,108,255,0.22)",
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPad,
    borderWidth: 1,
    borderColor: "rgba(124,108,255,0.35)",
  },

  profileHeroRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },

  // ⭐ pill de nível (canto direito do card)
  levelPill: {
    height: 56,
    minWidth: 64,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  levelPillText: {
    fontSize: 10,
    fontWeight: "900",
    includeFontPadding: false,
    maxWidth: 80,
    textAlign: "center",
  },

  avatarWrap: { position: "relative" },
  avatarBig: {
    width: 74,
    height: 74,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: UI.brand.primary,
  },
  avatarBadge: {
    position: "absolute",
    right: -6,
    bottom: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: UI.brand.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
  },

  heroHello: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "600",
  },
  heroName: {
    color: UI.colors.text,
    fontSize: 18,
    fontWeight: "600",
    marginTop: 4,
  },
  heroEmail: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    marginTop: 3,
    fontWeight: "500",
  },

  whiteArea: { backgroundColor: UI.colors.white },
  whiteContent: {
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 18,
  },

  onboardingCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "rgba(245, 158, 11, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
    borderRadius: UI.radius.card,
    padding: 12,
    marginBottom: 14,
  },
  onboardingIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  onboardingTitle: {
    color: UI.brand.primaryText,
    fontSize: 13,
    fontWeight: "800",
  },
  onboardingText: {
    marginTop: 4,
    color: UI.colors.black45,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: UI.brand.primaryText,
    marginBottom: 12,
  },

  formCard: {
    backgroundColor: UI.colors.white,
    borderWidth: 1,
    borderColor: UI.colors.black08,
    borderRadius: UI.radius.card,
    padding: 14,
  },

  fieldWrap: { paddingVertical: 8 },

  fieldLabel: {
    color: "#141414",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: UI.colors.black05,
    borderRadius: UI.radius.input,
    borderWidth: 1,
    borderColor: UI.colors.black08,
    paddingHorizontal: 12,
    height: 48,
  },

  inputIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "rgba(124,108,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  input: {
    flex: 1,
    color: UI.brand.primaryText,
    fontSize: 15,
    fontWeight: "500",
    paddingVertical: 0,
  },

  saveBtn: {
    marginTop: 16,
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnOnboarding: {
    backgroundColor: "#141414",
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  dangerLink: {
    marginTop: 14,
    alignItems: "center",
    paddingVertical: 10,
  },
  dangerText: {
    color: UI.colors.black45,
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  heroTextCol: {
    flex: 1,
    paddingVertical: 4,
  },

  levelPillRight: {
    marginLeft: "auto",
  },
});
