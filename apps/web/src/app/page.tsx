import { getT } from "@/lib/i18n/server";

export default async function HomePage() {
  const { t } = await getT();
  return <main style={{ padding: 24, fontFamily: "system-ui" }}>{t("home.title")}</main>;
}
