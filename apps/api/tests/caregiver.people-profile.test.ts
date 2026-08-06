import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { partner, tag, tagBatch } from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";

process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const db = drizzle(postgres(process.env.DATABASE_URL!));
let app: typeof import("../src/index.js")["app"];

beforeAll(async () => {
  app = (await import("../src/index.js")).app;
});

beforeEach(async () => {
  await resetCaregiverTables(db);
});

async function signupAndCookie(email: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password: "correct-horse-battery-staple", name: email }),
    headers: { "content-type": "application/json" },
  });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no set-cookie on signup");
  return setCookie
    .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
    .map((c) => c.split(";")[0]!.trim())
    .join("; ");
}

async function addContact(cookie: string, value: string, label: string, relationship: string) {
  const res = await app.request("/api/caregiver/contacts", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ kind: "phone", label, relationship, value }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe("structured protected-person profile", () => {
  it("stores and returns full name, medical fields, and emergency contacts with relationship", async () => {
    const cookie = await signupAndCookie("p1@test.dev");
    const mom = await addContact(cookie, "+5215511111111", "María", "mamá");
    const dad = await addContact(cookie, "+5215522222222", "Carlos", "papá");

    const created = await app.request("/api/caregiver/people", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        nickname: "Juanito",
        fullName: "Juan Martínez",
        bloodType: "O+",
        medicalConditions: "Autismo, no verbal",
        allergies: "Frutos secos",
        medications: "Risperidona",
        primaryContactId: mom,
        secondaryContactId: dad,
      }),
    });
    expect(created.status).toBe(201);

    const list = await app.request("/api/caregiver/people", { headers: { cookie } });
    const body = (await list.json()) as { people: Array<Record<string, unknown>> };
    const person = body.people[0]!;
    expect(person.fullName).toBe("Juan Martínez");
    expect(person.bloodType).toBe("O+");
    expect(person.allergies).toBe("Frutos secos");
    expect(person.medications).toBe("Risperidona");
    expect(person.medicalConditions).toBe("Autismo, no verbal");
    const primary = person.primaryContact as { id: string; relationship: string | null };
    const secondary = person.secondaryContact as { id: string; relationship: string | null };
    expect(primary.id).toBe(mom);
    expect(primary.relationship).toBe("mamá");
    expect(secondary.id).toBe(dad);
    expect(secondary.relationship).toBe("papá");
  });

  it("rejects emergency contacts owned by another caregiver with 404", async () => {
    const mine = await signupAndCookie("p2@test.dev");
    const theirs = await signupAndCookie("p3@test.dev");
    const foreignContact = await addContact(theirs, "+5215533333333", "Ana", "hija");

    const res = await app.request("/api/caregiver/people", {
      method: "POST",
      headers: { cookie: mine, "content-type": "application/json" },
      body: JSON.stringify({ nickname: "X", primaryContactId: foreignContact }),
    });
    expect(res.status).toBe(404);
  });

  it("pairing with a protectedPersonId links the profile; the public lookup shows full name + medical info but never contact details", async () => {
    const cookie = await signupAndCookie("p4@test.dev");
    const mom = await addContact(cookie, "+5215544444444", "María", "mamá");
    const personRes = await app.request("/api/caregiver/people", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        nickname: "Max",
        fullName: "Max (golden retriever)",
        bloodType: "DEA 1+",
        allergies: "Proteína de pollo",
        primaryContactId: mom,
      }),
    });
    const personId = ((await personRes.json()) as { id: string }).id;

    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "LINK1", partnerId: p!.id, batchId: b!.id, state: "active" });

    const pair = await app.request("/api/caregiver/tags/LINK1/pair", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ contactId: mom, label: "Collar", protectedPersonId: personId }),
    });
    expect(pair.status).toBe(200);

    const pub = await app.request("/api/public/tag/LINK1");
    expect(pub.status).toBe(200);
    const body = (await pub.json()) as Record<string, unknown>;
    expect(body.state).toBe("registered");
    expect(body.personName).toBe("Max (golden retriever)");
    expect(body.bloodType).toBe("DEA 1+");
    expect(body.allergies).toBe("Proteína de pollo");
    // Privacy invariant: the finder payload must not carry caregiver contact data.
    expect(JSON.stringify(body)).not.toContain("+5215544444444");
    expect("primaryContact" in body).toBe(false);
  });

  it("rejects pairing with a protectedPersonId owned by another caregiver", async () => {
    const mine = await signupAndCookie("p5@test.dev");
    const theirs = await signupAndCookie("p6@test.dev");
    const theirContact = await addContact(theirs, "+5215555555555", "Luis", "hijo");
    const theirPersonRes = await app.request("/api/caregiver/people", {
      method: "POST",
      headers: { cookie: theirs, "content-type": "application/json" },
      body: JSON.stringify({ nickname: "Theirs", primaryContactId: theirContact }),
    });
    const theirPersonId = ((await theirPersonRes.json()) as { id: string }).id;

    const myContact = await addContact(mine, "+5215566666666", "Yo", "yo");
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "LINK2", partnerId: p!.id, batchId: b!.id, state: "active" });

    const pair = await app.request("/api/caregiver/tags/LINK2/pair", {
      method: "POST",
      headers: { cookie: mine, "content-type": "application/json" },
      body: JSON.stringify({ contactId: myContact, protectedPersonId: theirPersonId }),
    });
    expect(pair.status).toBe(404);
  });
});
