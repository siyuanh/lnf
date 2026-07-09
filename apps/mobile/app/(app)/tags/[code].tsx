import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import type { TagDetailResponse } from "@app/schemas";
import { fetchTag } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import { styles, colors } from "@/lib/theme";
import { t } from "@/lib/i18n";

type Detail = TagDetailResponse;

export default function TagDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const navigation = useNavigation();
  const [tag, setTag] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!code) return;
    (async () => {
      try {
        const data = await fetchTag(code);
        setTag(data);
        navigation.setOptions({ title: data.personName || data.label || data.code });
      } catch {
        setNotFound(true);
      }
    })();
  }, [code, navigation]);

  if (notFound) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: colors.muted }}>{t("tagDetail.notFound")}</Text>
      </View>
    );
  }

  if (!tag) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ color: colors.muted, marginTop: 8 }}>{t("tagDetail.loading")}</Text>
      </View>
    );
  }

  const finderUrl = `${API_BASE_URL}/f/${tag.code}`;

  return (
    <ScrollView style={styles.screen}>
      <View style={{ alignItems: "center", marginVertical: 16 }}>
        <QRCode value={finderUrl} size={200} />
        <Text style={[styles.code, { marginTop: 8 }]}>{tag.code}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>{t("tagDetail.person")}</Text>
        {tag.personName || tag.personDetails ? (
          <>
            {!!tag.personName && <Text style={styles.rowValue}>{tag.personName}</Text>}
            {!!tag.personDetails && (
              <>
                <Text style={styles.rowLabel}>{t("tagDetail.details")}</Text>
                <Text style={styles.rowValue}>{tag.personDetails}</Text>
              </>
            )}
          </>
        ) : (
          <Text style={{ color: colors.muted }}>{t("tagDetail.noPerson")}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>{t("tagDetail.contact")}</Text>
        {tag.contact ? (
          <Text style={styles.rowValue}>
            {tag.contact.label ? `${tag.contact.label} — ` : ""}
            {tag.contact.value}
          </Text>
        ) : (
          <Text style={{ color: colors.muted }}>{t("tagDetail.noContact")}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.rowLabel}>{t("tagDetail.state")}</Text>
        <Text style={styles.rowValue}>{tag.state}</Text>
      </View>
    </ScrollView>
  );
}
