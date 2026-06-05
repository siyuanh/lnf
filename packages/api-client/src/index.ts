import { hc } from "hono/client";
import type { AppType } from "@app/api";

export function makeClient(baseUrl: string, init?: RequestInit) {
  return hc<AppType>(baseUrl, { init });
}

export type ApiClient = ReturnType<typeof makeClient>;
