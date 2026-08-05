"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PartnerNavProps {
  onLogout: () => void;
  logoutLabel: string;
  batchesLabel: string;
}

export function PartnerNav({ onLogout, logoutLabel, batchesLabel }: PartnerNavProps) {
  const pathname = usePathname();
  
  const isActive = (path: string) => {
    if (path === "/partner/batches") {
      return pathname === path || pathname.startsWith("/partner/batches/");
    }
    return pathname === path;
  };

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link 
              href="/partner/batches"
              className={cn(
                "text-sm font-medium transition-colors hover:text-navy-900",
                isActive("/partner/batches") 
                  ? "text-navy-900" 
                  : "text-slate-600"
              )}
            >
              {batchesLabel}
            </Link>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onLogout}
            className="text-slate-600 hover:text-navy-900"
          >
            {logoutLabel}
          </Button>
        </div>
      </div>
    </nav>
  );
}
