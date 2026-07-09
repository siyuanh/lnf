import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { styles } from "@/lib/theme";
import { t } from "@/lib/i18n";

// Loose phone check mirroring the web signup — strict validation lives server
// side / at the SMS provider.
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !PHONE_RE.test(trimmedPhone)) {
      setError(t("signup.failed"));
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim() || email.trim(), trimmedPhone || undefined);
    } catch {
      setError(t("signup.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={styles.h1}>{t("signup.title")}</Text>

        <Text style={styles.label}>{t("signup.name")}</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />

        <Text style={styles.label}>{t("login.email")}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Text style={styles.label}>{t("signup.phone")}</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
        />

        <Text style={styles.label}>{t("login.password")}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, (loading || !email || password.length < 8) && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={loading || !email || password.length < 8}
        >
          <Text style={styles.buttonText}>
            {loading ? t("signup.submitting") : t("signup.submit")}
          </Text>
        </TouchableOpacity>

        <Link href="/(auth)/login" style={styles.link}>
          {t("signup.toLogin")}
        </Link>
      </View>
    </View>
  );
}
