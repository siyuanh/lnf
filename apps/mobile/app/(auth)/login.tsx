import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { styles } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch {
      setError(t("login.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={styles.h1}>{t("login.title")}</Text>

        <Text style={styles.label}>{t("login.email")}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Text style={styles.label}>{t("login.password")}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, (loading || !email || !password) && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={loading || !email || !password}
        >
          <Text style={styles.buttonText}>
            {loading ? t("login.submitting") : t("login.submit")}
          </Text>
        </TouchableOpacity>

        <Link href="/(auth)/signup" style={styles.link}>
          {t("login.toSignup")}
        </Link>
      </View>
    </View>
  );
}
