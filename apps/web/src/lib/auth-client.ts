import { createAuthClient } from "better-auth/react";

// Same-origin: web rewrites /api/* to the api container (see next.config.ts).
// Better-Auth's client appends /auth/* to baseURL, so this resolves to /api/auth/*.
export const authClient = createAuthClient({
  baseURL: "/api",
});
