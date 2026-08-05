"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/lib/i18n/use-t";
import { CaregiverNav } from "./_components/CaregiverNav";

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
      <CaregiverNav email={me?.email ?? null} onLogout={logout} />
      {children}
    </>
  );
}
