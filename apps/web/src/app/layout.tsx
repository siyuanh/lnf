import { LangSwitcher } from "@/components/LangSwitcher";
import { getLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";

export const metadata = { title: "LNF" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider value={locale}>
          <LangSwitcher current={locale} />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
