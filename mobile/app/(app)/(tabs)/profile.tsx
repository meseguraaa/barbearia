import React, { memo, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  ScrollView,
  TextInput,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { UI, styles } from "../../../src/theme/client-theme";

const STICKY_ROW_H = 74;

const Field = memo(function Field({
  label,
  value,
  placeholder,
  icon,
}: {
  label: string;
  value?: string;
  placeholder: string;
  icon: any;
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
        />
      </View>
    </View>
  );
});

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const me = useMemo(
    () => ({
      name: "Bruno Leal",
      email: "bruno@email.com",
      phone: "(11) 99999-9999",
      birth: "10/02/1994",
      avatar: "https://i.pravatar.cc/200?img=12",
    }),
    [],
  );

  const TOP_OFFSET = insets.top + STICKY_ROW_H;
  const topBounceHeight = useMemo(() => TOP_OFFSET + 1400, [TOP_OFFSET]);

  const safeTopStyle = useMemo(
    () => ({ height: insets.top, backgroundColor: UI.brand.primary }),
    [insets.top],
  );

  return (
    <View style={S.page}>
      {/* TOPO FIXO */}
      <View style={S.fixedTop}>
        <View style={safeTopStyle} />
        <View style={S.stickyRow}>
          {/* vazio por enquanto */}
          <Text style={S.title}>Perfil</Text>
        </View>
      </View>

      <ScrollView
        style={S.scroll}
        contentContainerStyle={S.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ✅ garante topo escuro ao puxar pra baixo */}
        <View
          pointerEvents="none"
          style={[S.topBounceDark, { height: topBounceHeight }]}
        />

        {/* spacer do topo fixo */}
        <View style={{ height: TOP_OFFSET, backgroundColor: UI.colors.bg }} />

        {/* BLOCO ESCURO */}
        <View style={S.darkShell}>
          <View style={S.darkInner}>
            <View style={styles.glassCard}>
              <View style={S.profileHeroRow}>
                {/* ✅ avatar clicável, sem botão extra */}
                <Pressable style={S.avatarWrap} onPress={() => {}}>
                  <Image source={{ uri: me.avatar }} style={S.avatarBig} />
                  <View style={S.avatarBadge}>
                    <FontAwesome
                      name="camera"
                      size={12}
                      color={UI.colors.white}
                    />
                  </View>
                </Pressable>

                <View style={S.heroTextCol}>
                  <Text style={S.heroHello}>Seus dados</Text>
                  <Text style={S.heroName} numberOfLines={1}>
                    {me.name}
                  </Text>
                  <Text style={S.heroEmail} numberOfLines={1}>
                    {me.email}
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
                Layout only. Depois ligamos validação e API.
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
                value={me.name}
                placeholder="Seu nome completo"
                icon="user"
              />
              <View style={S.divider} />

              <Field
                label="E-mail"
                value={me.email}
                placeholder="seu@email.com"
                icon="envelope"
              />
              <View style={S.divider} />

              <Field
                label="Telefone"
                value={me.phone}
                placeholder="(00) 00000-0000"
                icon="phone"
              />
              <View style={S.divider} />

              <Field
                label="Data de nascimento"
                value={me.birth}
                placeholder="dd/mm/aaaa"
                icon="calendar"
              />
            </View>

            <Pressable style={S.primaryBtn}>
              <Text style={S.primaryBtnText}>Salvar alterações</Text>
            </Pressable>

            <Pressable style={S.dangerLink}>
              <Text style={S.dangerText}>Sair da conta</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
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
    justifyContent: "center",
  },

  navBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
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

  smallGhostBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: UI.radius.pill,
    backgroundColor: UI.colors.overlay08,
    borderWidth: 1,
    borderColor: UI.colors.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  smallGhostText: { color: UI.colors.text, fontSize: 13, fontWeight: "600" },

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

  /* ✅ coluna de texto um pouco mais “presente” */
  heroTextCol: {
    flex: 1,
    paddingVertical: 4,
  },
});
