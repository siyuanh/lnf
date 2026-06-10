"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/use-t";

interface MeResponse {
  partnerId: string;
  partnerUserId: string;
  sessionMaxAgeSec: number;
}

const ACTIVITY_EVENTS = ["mousemove", "keydown", "scroll", "click", "touchstart"] as const;
// How long to wait between server-side session refreshes. Cheaper than calling
// /me on every keystroke; client-side idle timer still expires precisely.
const REFRESH_INTERVAL_MS = 60_000;

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function redirectToLogin(reason: "expired" | "manual") {
    const target = reason === "expired" ? "/partner/login?expired=1" : "/partner/login";
    router.replace(target);
  }

  async function logout() {
    await authClient.signOut();
    redirectToLogin("manual");
  }

  // Bootstrap: confirm session on first render. /me returns 401 if the cookie
  // is missing/expired — kick to login on either.
  useEffect(() => {
    if (path === "/partner/login") {
      setReady(true);
      return;
    }
    fetch("/api/partner/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: MeResponse) => {
        setMe(data);
        setReady(true);
      })
      .catch(() => redirectToLogin("expired"));
    // path is the only dep — router/redirect are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Idle watcher: reset the timer on any user activity. When the timer fires,
  // we're past sessionMaxAgeSec without a request — sign out and redirect.
  // Better-Auth's sliding window means real fetches also extend the cookie,
  // so this timer mostly catches truly-idle tabs.
  useEffect(() => {
    if (!me || path === "/partner/login") return;

    const timeoutMs = me.sessionMaxAgeSec * 1000;

    function arm() {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(async () => {
        await authClient.signOut().catch(() => {});
        redirectToLogin("expired");
      }, timeoutMs);
    }

    arm();
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, arm, { passive: true });

    // Periodically re-confirm with the server in case the cookie was revoked
    // out-of-band (admin invalidation, db expiry tick).
    const refreshId = setInterval(() => {
      fetch("/api/partner/me", { credentials: "include" }).then((r) => {
        if (!r.ok) redirectToLogin("expired");
      });
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, arm);
      clearInterval(refreshId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, path]);

  if (!ready) return null;

  // Login route renders alone — no logout chrome.
  if (path === "/partner/login") return <>{children}</>;

  return (
    <>
      <header
        style={{
          position: "fixed",
          top: 12,
          right: 96,
          zIndex: 99,
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontFamily: "system-ui",
          fontSize: 13,
        }}
      >
        <button
          type="button"
          onClick={logout}
          style={{
            padding: "4px 10px",
            border: "1px solid #ccc",
            borderRadius: 4,
            background: "white",
            cursor: "pointer",
          }}
        >
          {t("header.logout")}
        </button>
      </header>
      {children}
    </>
  );
}
