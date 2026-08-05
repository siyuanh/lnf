import Link from "next/link";
import { Logo } from "./Logo";
import { LangSwitcher } from "./LangSwitcher";
import type { Locale } from "@/lib/i18n/dict";

interface Props {
  current: Locale;
}

export function SiteHeader({ current }: Props) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" aria-label="Encuéntrame — home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Logo />
        </Link>
        <LangSwitcher current={current} />
      </div>
    </header>
  );
}
