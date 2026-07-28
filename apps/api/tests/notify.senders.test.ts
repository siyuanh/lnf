import { describe, it, expect } from "vitest";
import { makeFakeSenders, type NotificationMessage } from "../src/notify/senders.js";
import { makeRegistry } from "../src/notify/registry.js";
import { renderAlert } from "../src/notify/templates.js";

describe("notification senders", () => {
  const msg: NotificationMessage = {
    kind: "sms",
    target: "+5215512345678",
    subject: "LNF alerta",
    text: "Alguien reportó a Alex. Responde: https://x.test/ack",
    locale: "es",
  };

  it("fake sender records calls and reports sent", async () => {
    const { senders, calls } = makeFakeSenders();
    const result = await senders.sms!.send(msg);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ msg, result: expect.objectContaining({ ok: true }) }]);
  });

  it("fake sender can be made to fail", async () => {
    const { senders } = makeFakeSenders({ failKinds: ["sms"] });
    const result = await senders.sms!.send(msg);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("provider_error");
  });

  it("registry returns fakes when provider env is absent", () => {
    const registry = makeRegistry({} as never);
    expect(registry.email!.name).toBe("fake-email");
    expect(registry.sms!.name).toBe("fake-sms");
    expect(registry.voice!.name).toBe("fake-voice");
  });

  it("renderAlert interpolates es template with ack link", () => {
    const out = renderAlert("es", { personLabel: "Alex", ackUrl: "https://x/ack", locationText: "el parque" });
    expect(out.text).toContain("Alex");
    expect(out.text).toContain("https://x/ack");
    expect(out.subject.length).toBeGreaterThan(0);
  });
});
