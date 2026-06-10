"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/use-t";

interface MeResponse {
  caregiverId: string;
  email: string;
}

const PUBLIC_PATHS = new Set(["/caregiver/login", "/caregiver/signup"]);

export default function CaregiverLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);

  async function logout() {
    await authClient.signOut();
    router.replace("/caregiver/login");
  }

  useEffect(() => {
    if (PUBLIC_PATHS.has(path)) {
      setReady(true);
      return;
    }
    fetch("/api/caregiver/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: MeResponse) => {
        setMe(data);
        setReady(true);
      })
      .catch(() => router.replace("/caregiver/login"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (!ready) return null;
  if (PUBLIC_PATHS.has(path)) return <>{children}</>;

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
        {me && <span style={{ color: "#666" }}>{me.email}</span>}
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
