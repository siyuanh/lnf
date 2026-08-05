"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/use-t";
import { safeNext } from "@/lib/safe-next";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { getPublicConfig } from "@/lib/config";
import { LogoMark } from "@/components/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  const expired = params.get("expired") === "1";
  const next = safeNext(params.get("next"));

  useEffect(() => {
    getPublicConfig().then((config) => setGoogleEnabled(config.googleSignInEnabled));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? t("login.failed"));
      return;
    }
    router.push(next ?? "/caregiver/people");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <div className="text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-900">{t("caregiverLogin.title")}</h1>
      </div>
      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4 pt-6">
          {expired && <Alert variant="warning">{t("login.expired")}</Alert>}
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="login-email">{t("login.email")}</Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="login-password">{t("login.password")}</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Button type="submit" variant="accent" size="lg" disabled={loading} className="w-full">
              {loading ? t("login.submitting") : t("login.submit")}
            </Button>
          </form>
          {googleEnabled && (
            <>
              <div className="flex items-center gap-3">
                <hr className="flex-1 border-slate-200" />
                <span className="text-xs text-slate-500">{t("oauth.or")}</span>
                <hr className="flex-1 border-slate-200" />
              </div>
              <GoogleSignInButton
                callbackURL={next ?? "/caregiver/people"}
                label={t("oauth.google")}
              />
            </>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        {t("caregiverLogin.noAccount")}{" "}
        <Link
          href={next ? `/caregiver/signup?next=${encodeURIComponent(next)}` : "/caregiver/signup"}
          className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          {t("caregiverLogin.signUp")}
        </Link>
      </p>
    </main>
  );
}

export default function CaregiverLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
