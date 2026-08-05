import { cn } from "@/lib/utils";

// Stand-in reproduction of the Encuéntrame mark (pin + signal waves) as inline
// SVG so it stays crisp at any size and inherits no network cost. Replace with
// the official asset in apps/web/public/ when the design file lands.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 50 48" className={className} role="img" aria-label="Encuéntrame">
      <path
        d="M20 2C10.6 2 3 9.6 3 19c0 6.3 3.5 11.8 8.7 14.7L20 46l8.3-12.3C33.5 30.8 37 25.3 37 19 37 9.6 29.4 2 20 2Z"
        fill="#0B1F4B"
      />
      <circle cx="20" cy="19" r="7.5" fill="#ffffff" />
      <circle cx="20" cy="19" r="4" fill="#0B1F4B" />
      <path d="M41 15a7 7 0 0 1 0 8" fill="none" stroke="#2E7CF1" strokeWidth="3" strokeLinecap="round" />
      <path d="M45 11a12 12 0 0 1 0 16" fill="none" stroke="#2E7CF1" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface LogoProps {
  variant?: "mark" | "full";
  className?: string;
}

export function Logo({ variant = "full", className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-8" />
      {variant === "full" && (
        <span className="text-lg font-semibold tracking-wide text-navy-900">ENCUÉNTRAME</span>
      )}
    </span>
  );
}
