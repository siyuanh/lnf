import { LangSwitcher } from "@/components/LangSwitcher";
import { getLocale } from "@/lib/i18n/server";

export const metadata = { title: "LNF" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <LangSwitcher current={locale} />
        {children}
      </body>
    </html>
  );
}
