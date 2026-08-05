"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/use-t";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { getPublicConfig } from "@/lib/config";
import { LogoMark } from "@/components/Logo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
    router.push("/partner/batches");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <LogoMark className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl font-bold text-navy-900">{t("login.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {expired && (
            <Alert variant="warning">
              {t("login.expired")}
            </Alert>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("login.password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
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
              <GoogleSignInButton callbackURL="/partner/batches" label={t("oauth.google")} />
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function PartnerLoginPage() {
  // useSearchParams() requires a Suspense boundary in Next.js 15's app router.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
