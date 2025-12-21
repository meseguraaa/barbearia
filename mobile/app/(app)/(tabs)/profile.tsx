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

type MeApiUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  phone: string | null;
  birthday: string | Date | null;
};

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
          <FontAwesome name={icon} size={16} color={UI.brand.primaryText} />
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

  // ✅ gate: só precisa garantir que /me terminou 1 vez
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

  async function forceLogoutToLogin() {
    try {
      await signOut();
    } finally {
      router.replace("/(auth)/login");
    }
  }

  // Carrega /me (1x por mount). Se você quiser recarregar ao focar depois, eu adapto.
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingMe(true);

        const res = await apiFetch<{ user: MeApiUser }>("/api/mobile/me");
        if (!alive) return;

        const u = res.user;

        setName(u.name ?? "");
        setEmail(u.email ?? "");

        // ✅ avatar vem do provider (ou placeholder)
        setAvatar(u.image?.trim() ? u.image : AVATAR_PLACEHOLDER);

        setPhone(u.phone ? maskPhone(u.phone) : "");
        setBirth(maskDate(formatBirthdayBR(u.birthday)));
      } catch {
        Alert.alert("Erro", "Não foi possível carregar seus dados.");
        setAvatar(AVATAR_PLACEHOLDER);
      } finally {
        if (!alive) return;
        setLoadingMe(false);

        // ✅ libera uma vez e não mexe mais (evita skeleton piscando)
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

  async function handleSave() {
    if (saving) return;

    const b = birth.trim();
    if (b.length > 0 && !/^\d{2}\/\d{2}\/\d{4}$/.test(b)) {
      Alert.alert("Data inválida", "Use o formato 00/00/0000.");
      return;
    }

    try {
      setSaving(true);

      await apiFetch("/api/mobile/me", {
        method: "PATCH",
        body: JSON.stringify({
          phone: phone.trim() || null,
          birthday: b || null,
        }),
      });

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
                <View style={styles.glassCard}>
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
                  </View>
                </View>

                <View style={S.hintRow}>
                  <FontAwesome
                    name="lock"
                    size={14}
                    color="rgba(255,255,255,0.75)"
                  />
                  <Text style={S.hintText}>
                    A foto vem do login social. Upload fica pra depois.
                  </Text>
                </View>
              </View>
            </View>

            {/* ÁREA BRANCA */}
            <View style={S.whiteArea}>
              <View style={S.whiteContent}>
                <Text style={S.sectionTitle}>Informações</Text>

                <View style={S.formCard}>
                  <Field
                    label="Nome"
                    value={name}
                    placeholder="Seu nome completo"
                    icon="user"
                    editable={false}
                  />
                  <View style={S.divider} />

                  <Field
                    label="E-mail"
                    value={email}
                    placeholder="seu@email.com"
                    icon="envelope"
                    editable={false}
                  />
                  <View style={S.divider} />

                  <Field
                    label="Telefone"
                    value={phone}
                    placeholder="(00) 00000-0000"
                    icon="phone"
                    editable={!loadingMe && !saving}
                    onChangeText={(t) => setPhone(maskPhone(t))}
                    keyboardType="number-pad"
                  />
                  <View style={S.divider} />

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
                    S.primaryBtn,
                    saving || loadingMe ? { opacity: 0.85 } : null,
                  ]}
                  onPress={handleSave}
                  disabled={saving || loadingMe}
                >
                  {saving ? (
                    <ActivityIndicator color={UI.colors.white} />
                  ) : (
                    <Text style={S.primaryBtnText}>Salvar alterações</Text>
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

  profileHeroRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
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

  hintRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
  },
  hintText: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
    fontWeight: "500",
  },

  whiteArea: { backgroundColor: UI.colors.white },
  whiteContent: {
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: 18,
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
    color: UI.colors.black45,
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
    backgroundColor: "rgba(124,108,255,0.10)",
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

  divider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginVertical: 6,
  },

  primaryBtn: {
    marginTop: 16,
    height: 56,
    backgroundColor: UI.brand.primary,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
  },
  primaryBtnText: {
    color: UI.colors.text,
    fontSize: 15,
    fontWeight: "600",
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
});
