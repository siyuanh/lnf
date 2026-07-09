import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import type { RegisteredTagSummary } from "@app/schemas";
import { fetchTags } from "@/lib/api";
import { styles, colors } from "@/lib/theme";
import { t } from "@/lib/i18n";

type Tag = RegisteredTagSummary;

function contactSummary(c: Tag["contact"]): string {
  if (!c) return "—";
  const prefix = c.kind === "phone" ? "☎" : c.kind === "email" ? "✉" : "🏠";
  return `${prefix} ${c.label ? `${c.label} — ${c.value}` : c.value}`;
}

export default function TagsScreen() {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setTags(await fetchTags());
    } catch {
      setError(true);
      setTags([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (tags === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ color: colors.muted, marginTop: 8 }}>{t("tags.loading")}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: colors.danger, marginBottom: 12 }}>{t("tags.error")}</Text>
        <TouchableOpacity style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>{t("tags.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16 }}
      data={tags}
      keyExtractor={(item) => item.code}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={<Text style={{ color: colors.muted, padding: 8 }}>{t("tags.empty")}</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/(app)/tags/${encodeURIComponent(item.code)}`)}
        >
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>
            {item.personName || item.label || item.code}
          </Text>
          <Text style={styles.code}>{item.code}</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>{contactSummary(item.contact)}</Text>
        </TouchableOpacity>
      )}
    />
  );
}
