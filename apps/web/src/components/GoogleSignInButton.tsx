"use client";
import { authClient } from "@/lib/auth-client";

interface Props {
  callbackURL: string;
  label: string;
}

// Redirects the browser to Google's consent screen; Better-Auth handles the
// OAuth dance and lands back on callbackURL with a session cookie set. Same
// button works for both caregiver and partner portals — only callbackURL
// differs, matching how the email/password forms already route per-portal.
export function GoogleSignInButton({ callbackURL, label }: Props) {
  return (
    <button
      type="button"
      onClick={() => authClient.signIn.social({ provider: "google", callbackURL })}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: "100%",
        padding: "8px 12px",
        border: "1px solid #ccc",
        borderRadius: 4,
        background: "white",
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.81 2.73v2.27h2.92c1.71-1.57 2.69-3.88 2.69-6.64z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.92-2.27c-.81.55-1.85.87-3.04.87-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72A5.4 5.4 0 013.68 9c0-.6.1-1.18.29-1.72V4.94H.96A8.99 8.99 0 000 9c0 1.45.35 2.83.96 4.06l3.01-2.34z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"
        />
      </svg>
      {label}
    </button>
  );
}
