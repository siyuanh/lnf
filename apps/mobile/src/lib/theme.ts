import { StyleSheet } from "react-native";

// Small shared style kit so screens stay consistent without a UI dependency.
export const colors = {
  text: "#111",
  muted: "#666",
  faint: "#999",
  border: "#e2e2e2",
  primary: "#0b6bcb",
  bg: "#fff",
  card: "#f7f9fc",
  danger: "crimson",
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  h1: { fontSize: 24, fontWeight: "700", color: colors.text, marginBottom: 16 },
  h2: { fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: 8 },
  label: { fontSize: 13, color: colors.muted, marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
  link: { color: colors.primary, marginTop: 16, textAlign: "center" },
  error: { color: colors.danger, marginTop: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  code: { fontFamily: "Courier", color: colors.faint, fontSize: 13 },
  rowLabel: { fontSize: 13, color: colors.muted },
  rowValue: { fontSize: 16, color: colors.text, marginBottom: 10 },
});
