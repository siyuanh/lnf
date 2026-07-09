import type { RegisteredTagListResponse, TagDetailResponse } from "@app/schemas";
import { API_BASE_URL } from "./config";
import { getToken } from "./token-store";

// Mobile talks to the API with plain fetch + bearer token, typed by the shared
// Zod contracts in @app/schemas. (The web app uses fetch the same way; the Hono
// RPC client can't type the session sub-routers because they aren't
// method-chained, so the schema package is our source of truth here.)
async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
}

export async function fetchTags(): Promise<RegisteredTagListResponse["tags"]> {
  const res = await authedFetch("/api/caregiver/tags");
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as RegisteredTagListResponse;
  return data.tags;
}

export async function fetchTag(code: string): Promise<TagDetailResponse> {
  const res = await authedFetch(`/api/caregiver/tags/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as TagDetailResponse;
}

export interface AuthResult {
  token: string;
  email: string;
}

// Better-Auth's email sign-in/up endpoints aren't part of the Hono AppType, so
// we call them with plain fetch. The bearer plugin returns the session token in
// the `set-auth-token` response header (and also in the JSON body).
async function authRequest(path: string, body: Record<string, unknown>): Promise<AuthResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = "auth_failed";
    try {
      const data = (await res.json()) as { message?: string };
      if (data.message) message = data.message;
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new Error(message);
  }
  const headerToken = res.headers.get("set-auth-token");
  const data = (await res.json()) as { token?: string; user?: { email?: string } };
  const token = headerToken ?? data.token;
  if (!token) throw new Error("no_token");
  return { token, email: data.user?.email ?? (body.email as string) };
}

export function signIn(email: string, password: string): Promise<AuthResult> {
  return authRequest("sign-in/email", { email, password });
}

export function signUp(
  email: string,
  password: string,
  name: string,
  phone?: string,
): Promise<AuthResult> {
  return authRequest("sign-up/email", { email, password, name, ...(phone ? { phone } : {}) });
}
