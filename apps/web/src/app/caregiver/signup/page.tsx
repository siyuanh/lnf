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

// Loose E.164-ish: leading `+` optional, 7–20 chars, digits and separators.
// Real E.164 validation happens server-side + at the SMS provider layer.
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  const next = safeNext(params.get("next"));

  useEffect(() => {
    getPublicConfig().then((config) => setGoogleEnabled(config.googleSignInEnabled));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !PHONE_RE.test(trimmedPhone)) {
      setError(t("signup.phoneInvalid"));
      return;
    }
    setLoading(true);
    const res = await authClient.signUp.email({
      email,
      password,
      name: name.trim() || email,
      // Better-Auth accepts additional user fields when registered on the
      // server. Cast because the generated types don't know about `phone`.
      ...(trimmedPhone ? { phone: trimmedPhone } : {}),
    } as Parameters<typeof authClient.signUp.email>[0]);
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? t("signup.failed"));
      return;
    }
    router.push(next ?? "/caregiver/people");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <div className="text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-900">{t("signup.title")}</h1>
      </div>
      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4 pt-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="signup-name">{t("signup.name")}</Label>
              <Input
                id="signup-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="signup-email">{t("signup.email")}</Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="signup-phone">
                {t("signup.phone")}{" "}
                <span className="font-normal text-slate-400">{t("signup.phoneHint")}</span>
              </Label>
              <Input
                id="signup-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <div>
              <Label htmlFor="signup-password">{t("signup.password")}</Label>
              <Input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Button type="submit" variant="accent" size="lg" disabled={loading} className="w-full">
              {loading ? t("signup.submitting") : t("signup.submit")}
            </Button>
            <p className="text-xs leading-relaxed text-slate-500">{t("signup.verificationNote")}</p>
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
        {t("signup.haveAccount")}{" "}
        <Link
          href={next ? `/caregiver/login?next=${encodeURIComponent(next)}` : "/caregiver/login"}
          className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          {t("signup.signIn")}
        </Link>
      </p>
    </main>
  );
}

// Suspense wraps useSearchParams to keep Next.js's prerender happy.
export default function CaregiverSignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
