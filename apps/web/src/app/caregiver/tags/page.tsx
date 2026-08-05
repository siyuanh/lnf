"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/use-t";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ContactKind = "phone" | "email" | "address";
interface TagContact {
  id: string;
  kind: ContactKind;
  label: string | null;
  value: string;
}
interface RegisteredTag {
  code: string;
  label: string | null;
  state: string;
  personName: string | null;
  contact: TagContact | null;
  registeredAt: string | null;
}

export default function TagsPage() {
  const t = useT();
  const [tags, setTags] = useState<RegisteredTag[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/caregiver/tags", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { tags: RegisteredTag[] }) => setTags(data.tags))
      .catch(() => setTags([]));
  }, []);

  async function revoke(code: string) {
    if (!window.confirm(t("tags.revokeConfirm"))) return;
    setRevoking(code);
    try {
      const res = await fetch(`/api/caregiver/tags/${encodeURIComponent(code)}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      setTags((prev) => prev?.filter((tag) => tag.code !== code) ?? prev);
    } catch {
      window.alert(t("tags.revokeFailed"));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-navy-900">{t("tags.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("tags.subtitle")}</p>

      {tags === null && <p className="mt-6 text-slate-600">{t("tags.loading")}</p>}
      {tags !== null && tags.length === 0 && (
        <p className="mt-6 text-slate-600">
          {t("tags.empty")}{" "}
          <Link href="/caregiver/contacts" className="font-medium text-brand-600 hover:underline">
            {t("tags.emptyLink")}
          </Link>
        </p>
      )}
      {tags !== null && tags.length > 0 && (
        <ul className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {tags.map((tag) => (
            <li key={tag.code} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{tag.code}</span>
                </div>
                <p className="mt-0.5 font-medium text-navy-900">
                  {tag.personName ?? tag.label ?? tag.code}
                </p>
                {tag.personName && tag.label && (
                  <p className="text-sm text-slate-600">{tag.label}</p>
                )}
                <p className="mt-0.5 text-xs text-slate-500">{contactSummary(tag.contact)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/caregiver/tags/${encodeURIComponent(tag.code)}`}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  {t("tags.view")}
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke(tag.code)}
                  disabled={revoking === tag.code}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  {t("tags.revoke")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function contactSummary(c: TagContact | null): string {
  if (!c) return "—";
  const prefix = c.kind === "phone" ? "☎" : c.kind === "email" ? "✉" : "🏠";
  return `${prefix} ${c.label ? `${c.label} — ${c.value}` : c.value}`;
}
