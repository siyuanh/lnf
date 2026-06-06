import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { partner, partnerUser } from "../src/db/schema.js";
import { loadEnv } from "../src/env.js";
import { makeAuth } from "../src/auth/better-auth.js";

const env = loadEnv();
const sql = postgres(env.DATABASE_URL);
const db = drizzle(sql);
const auth = makeAuth({ db, secret: env.BETTER_AUTH_SECRET, baseUrl: env.BETTER_AUTH_URL });

const SEED_EMAIL = "ops@acme.test";
const SEED_PASSWORD = "correct-horse-battery-staple";

async function main() {
  let p = (await db.select().from(partner).where(eq(partner.name, "Acme")).limit(1))[0];
  if (!p) {
    [p] = await db.insert(partner).values({ name: "Acme", billingEmail: SEED_EMAIL }).returning();
    console.log("created partner", p!.id);
  } else {
    console.log("partner exists", p.id);
  }
  const existingUser = (await db.select().from(partnerUser).where(eq(partnerUser.email, SEED_EMAIL)).limit(1))[0];
  if (!existingUser) {
    await db.insert(partnerUser).values({ partnerId: p!.id, email: SEED_EMAIL, role: "admin" });
    console.log("created partner_user", SEED_EMAIL);
  } else {
    console.log("partner_user exists", SEED_EMAIL);
  }
  try {
    await auth.api.signUpEmail({
      body: { email: SEED_EMAIL, password: SEED_PASSWORD, name: "Acme Ops" },
    });
    console.log("created auth user", SEED_EMAIL);
  } catch {
    console.log("auth user exists:", SEED_EMAIL);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
