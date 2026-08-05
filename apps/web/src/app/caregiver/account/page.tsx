"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n/use-t";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// §5.6 LGPD self-service: export everything the service holds on you, or
// permanently delete the account. Export is a plain navigation (the API
// responds with an attachment); delete requires the account password.
export default function AccountPage() {
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function onDelete() {
    if (!window.confirm(t("account.deleteConfirm"))) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/caregiver/account/delete", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // The session died with the account — land on the public home page.
      window.location.href = "/";
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-navy-900">{t("account.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("account.subtitle")}</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("account.exportTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm leading-relaxed text-slate-600">{t("account.exportBody")}</p>
          <a href="/api/caregiver/export" className={cn(buttonVariants({ variant: "outline" }), "mt-4 inline-flex")}>
            {t("account.exportButton")}
          </a>
        </CardContent>
      </Card>

      <Card className="mt-4 border-red-200">
        <CardHeader>
          <CardTitle className="text-base text-red-700">{t("account.deleteTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm leading-relaxed text-slate-600">{t("account.deleteBody")}</p>
          <div className="mt-4 max-w-xs">
            <Label htmlFor="delete-password">{t("account.password")}</Label>
            <Input
              id="delete-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button
            variant="destructive"
            disabled={busy || password.length === 0}
            onClick={onDelete}
            className="mt-4"
          >
            {t("account.deleteSubmit")}
          </Button>
          {error && <Alert variant="destructive" className="mt-3">{t("account.deleteFailed")}</Alert>}
        </CardContent>
      </Card>
    </main>
  );
}
