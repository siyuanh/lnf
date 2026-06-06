import { z } from "zod";

const PLACEHOLDER_PREFIX = "replace-with-";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  PARTNER_API_KEY_PEPPER: z.string().min(32),
  // Origin allowed to make credentialed requests against /api/auth/* and
  // /partner/*. Defaults to BETTER_AUTH_URL for the common case where the
  // portal and the auth callback share an origin; split when they diverge.
  WEB_ORIGIN: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema> & { WEB_ORIGIN: string };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    console.error("Invalid environment:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment");
  }
  const env = result.data;

  // Refuse to start in production with .env.example placeholder values. These
  // satisfy the length/format constraints (e.g. "replace-with-32-byte-..." is
  // exactly 32 chars), so without this guard a forgotten dev secret would
  // silently ship.
  if (env.NODE_ENV === "production") {
    const placeholders: string[] = [];
    if (env.BETTER_AUTH_SECRET.startsWith(PLACEHOLDER_PREFIX)) placeholders.push("BETTER_AUTH_SECRET");
    if (env.PARTNER_API_KEY_PEPPER.startsWith(PLACEHOLDER_PREFIX)) placeholders.push("PARTNER_API_KEY_PEPPER");
    if (placeholders.length > 0) {
      throw new Error(`Refusing to start: placeholder values in production env: ${placeholders.join(", ")}`);
    }
  }

  return { ...env, WEB_ORIGIN: env.WEB_ORIGIN ?? env.BETTER_AUTH_URL };
}
