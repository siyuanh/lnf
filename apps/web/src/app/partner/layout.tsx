"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (path === "/partner/login") {
      setReady(true);
      return;
    }
    authClient.getSession().then((res) => {
      if (!res.data) router.replace("/partner/login");
      else setReady(true);
    });
  }, [path, router]);

  if (!ready) return null;
  return <>{children}</>;
}
