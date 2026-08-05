"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/use-t";
import { cn } from "@/lib/utils";

interface Props {
  email: string | null;
  onLogout: () => void;
}

const TABS = [
  { href: "/caregiver/people", key: "people.title" },
  { href: "/caregiver/contacts", key: "contacts.title" },
  { href: "/caregiver/tags", key: "tags.title" },
  { href: "/caregiver/finds", key: "finds.title" },
  { href: "/caregiver/account", key: "account.title" },
] as const;

export function CaregiverNav({ email, onLogout }: Props) {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-navy-900",
                )}
              >
                {t(tab.key)}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          {email && <span className="hidden text-xs text-slate-500 sm:inline">{email}</span>}
          <button
            type="button"
            onClick={onLogout}
            className="text-sm font-medium text-slate-600 transition-colors hover:text-navy-900 hover:underline"
          >
            {t("header.logout")}
          </button>
        </div>
      </div>
    </nav>
  );
}
