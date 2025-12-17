export const UI = {
  brand: {
    name: "BarberShop",
    primary: "#7C6CFF",
    primaryText: "#0B0B10",
  },
  colors: {
    bg: "#05070C",
    card: "#0B0F17",
    cardBorder: "rgba(255,255,255,0.08)",
    text: "#F8FAFC",
    textMuted: "#9CA3AF",
    textDim: "rgba(255,255,255,0.65)",
    danger: "#F97373",
    success: "#86EFAC",
    divider: "rgba(255,255,255,0.12)",
    white: "#FFFFFF",
  },
  radius: {
    card: 18,
    input: 12,
  },
  spacing: {
    screenX: 22,
    headerH: 62,
    cardPad: 18,
  },
  shadow: {
    card: {
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
  },
} as const;

export const styles = {
  screen: { flex: 1, backgroundColor: UI.colors.bg },

  header: {
    height: UI.spacing.headerH,
    backgroundColor: UI.brand.primary,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 10 },

  headerTitle: {
    color: UI.colors.white,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  body: {
    flex: 1,
    paddingHorizontal: UI.spacing.screenX,
    justifyContent: "center",
  },

  card: {
    backgroundColor: UI.colors.card,
    borderWidth: 1.5,
    borderColor: UI.brand.primary,
    borderRadius: UI.radius.card,
    padding: UI.spacing.cardPad,
  },

  title: {
    color: UI.colors.text,
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 14,
  },

  subtitle: {
    color: UI.colors.textMuted,
    fontSize: 14,
    fontWeight: "400",
    textAlign: "center",
  },

  messageError: { color: UI.colors.danger, marginTop: 12, fontSize: 13 },
  messageSuccess: { color: UI.colors.success, marginTop: 12, fontSize: 13 },

  dividerRow: {
    marginTop: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: UI.colors.divider },
  dividerText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "700",
  },

  providerStack: { gap: 12 },

  providerBtnFull: {
    width: "100%",
    backgroundColor: UI.colors.white,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  providerBtnFullText: {
    color: UI.brand.primaryText,
    fontSize: 15,
    fontWeight: "900",
  },
} as const;
