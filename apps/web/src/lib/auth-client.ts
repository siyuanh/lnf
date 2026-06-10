import { createAuthClient } from "better-auth/react";

// Better-Auth parses baseURL with `new URL()` at module load, so we must hand
// it an absolute URL. baseURL is the SITE root — Better-Auth appends
// /api/auth/<action> itself, matching the server's `.all("/api/auth/*", ...)`
// mount. In the browser we use the live origin (same-origin: a Next.js rewrite
// forwards /api/* to the api sidecar). Under SSR/prerender there's no window;
// use a localhost placeholder. The "use client" pages that use authClient
// never run on the server at request time, so the placeholder is never hit.
const baseURL =
  typeof window === "undefined"
    ? "http://localhost:3000"
    : window.location.origin;

export const authClient = createAuthClient({ baseURL });
