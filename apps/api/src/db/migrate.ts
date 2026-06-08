import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv } from "../env.js";

const env = loadEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(sql);
const __dirname = dirname(fileURLToPath(import.meta.url));
await migrate(db, { migrationsFolder: join(__dirname, "migrations") });
console.log("migrations applied");
await sql.end();
