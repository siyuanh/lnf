import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Rendered when a scanner hits /f/<code> for a pairable tag but has no
// caregiver session. Deliberately not a form: we ask them to sign in first,
// carrying a `next` param so login/signup can redirect back to this same URL
// and the pair flow picks up automatically.
export default async function ActivatePrompt({ code }: { code: string }) {
  const { t } = await getT();
  const next = encodeURIComponent(`/f/${code}`);
  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <h1 className="text-2xl font-bold tracking-tight text-navy-900">{t("activate.title")}</h1>
      <p className="mt-3 leading-relaxed text-slate-600">{t("activate.body")}</p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/caregiver/login?next=${next}`}
          className={cn(buttonVariants({ variant: "accent", size: "lg" }), "w-full")}
        >
          {t("activate.signIn")}
        </Link>
        <Link
          href={`/caregiver/signup?next=${next}`}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
        >
          {t("activate.signUp")}
        </Link>
      </div>
      <p className="mt-10 text-center font-mono text-xs text-slate-400">
        {t("finder.tag")}: {code}
      </p>
    </main>
  );
}
