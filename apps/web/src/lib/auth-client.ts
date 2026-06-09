import { createAuthClient } from "better-auth/react";

// Better-Auth parses baseURL with `new URL()` at module load, which rejects
// bare paths like "/api" — so we hand it an absolute URL. In the browser we
// build it from window.location (same-origin: a Next.js rewrite forwards
// /api/* to the api sidecar). During SSR/prerender there's no window; use a
// localhost placeholder. The "use client" pages that use authClient never run
// on the server at request time, so the placeholder is never actually hit.
const baseURL =
  typeof window === "undefined"
    ? "http://localhost:3000/api"
    : `${window.location.origin}/api`;

export const authClient = createAuthClient({ baseURL });
