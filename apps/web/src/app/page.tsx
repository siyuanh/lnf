import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { LogoMark } from "@/components/Logo";

export default async function HomePage() {
  const { t } = await getT();
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-24">
      <LogoMark className="h-20 w-20" />
      <h1 className="mt-8 text-4xl font-bold tracking-tight text-navy-900 sm:text-5xl">
        {t("home.heroTitle")}
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">{t("home.heroSub")}</p>
      <div className="mt-10 grid w-full gap-4 sm:grid-cols-2">
        <Link
          href="/caregiver/login"
          className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="block text-base font-semibold text-navy-900">{t("home.ctaCaregiver")}</span>
        </Link>
        <Link
          href="/partner/login"
          className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="block text-base font-semibold text-navy-900">{t("home.ctaPartner")}</span>
        </Link>
      </div>
    </main>
  );
}
