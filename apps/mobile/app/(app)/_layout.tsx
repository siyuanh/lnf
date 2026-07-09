import { Stack } from "expo-router";
import { TouchableOpacity, Text } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { t } from "@/lib/i18n";
import { colors } from "@/lib/theme";

export default function AppLayout() {
  const { signOut } = useAuth();
  return (
    <Stack
      screenOptions={{
        headerRight: () => (
          <TouchableOpacity onPress={signOut}>
            <Text style={{ color: colors.primary, fontSize: 15 }}>{t("common.signOut")}</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Stack.Screen name="tags" options={{ title: t("tags.title") }} />
      <Stack.Screen name="tags/[code]" options={{ title: "" }} />
    </Stack>
  );
}
