"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n/use-t";

type Gps = { lat: number; lon: number; accuracyM?: number };

export default function FinderForm({
  code,
  personName,
  personDetails,
}: {
  code: string;
  personName?: string | null;
  personDetails?: string | null;
}) {
  const t = useT();
  const [gps, setGps] = useState<Gps | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function captureGps() {
    setGpsError(false);
    setGpsBusy(true);
    if (!navigator.geolocation) {
      setGpsBusy(false);
      setGpsError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        setGps({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
      },
      () => {
        setGpsBusy(false);
        setGpsError(true);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // GPS wins when both are set — finder hit the button and got a fix.
    const trimmedAddress = address.trim();
    const location = gps
      ? { kind: "gps" as const, lat: gps.lat, lon: gps.lon, accuracyM: gps.accuracyM }
      : trimmedAddress
        ? { kind: "address" as const, text: trimmedAddress }
        : null;
    if (!location) {
      setError(t("finderReport.locationRequired"));
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/public/tag/${encodeURIComponent(code)}/find`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location,
        message: message.trim() ? message.trim() : undefined,
        contact: contact.trim() ? contact.trim() : undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(t("finderReport.error"));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main style={{ maxWidth: 480, margin: "64px auto", fontFamily: "system-ui", textAlign: "center", padding: 16 }}>
        <h1>{t("finderReport.thanksTitle")}</h1>
        <p style={{ color: "#444" }}>{t("finderReport.thanksBody")}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "32px auto", fontFamily: "system-ui", padding: 16 }}>
      <h1 style={{ fontSize: 22 }}>{t("finderReport.title")}</h1>
      <p style={{ color: "#444" }}>{t("finderReport.intro")}</p>

      {(personName || personDetails) && (
        <section
          style={{
            marginTop: 16,
            padding: 16,
            background: "#f0f7ff",
            border: "1px solid #cfe3ff",
            borderRadius: 8,
          }}
        >
          {personName && (
            <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 18 }}>{personName}</p>
          )}
          {personDetails && (
            <p style={{ margin: 0, color: "#334", whiteSpace: "pre-wrap" }}>{personDetails}</p>
          )}
        </section>
      )}

      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={captureGps}
            disabled={gpsBusy}
            style={{ padding: "8px 12px", width: "100%" }}
          >
            {gpsBusy ? t("finderReport.gpsBusy") : t("finderReport.useGps")}
          </button>
          {gps && (
            <p style={{ color: "green", fontSize: 13, marginTop: 6 }}>
              {t("finderReport.gpsCaptured")} ({gps.lat.toFixed(5)}, {gps.lon.toFixed(5)})
            </p>
          )}
          {gpsError && (
            <p style={{ color: "crimson", fontSize: 13, marginTop: 6 }}>{t("finderReport.gpsError")}</p>
          )}
        </div>

        <label style={{ display: "block", marginBottom: 12 }}>
          {t("finderReport.address")}{" "}
          <span style={{ color: "#999", fontSize: 12 }}>{t("finderReport.addressHint")}</span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={200}
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          {t("finderReport.message")}{" "}
          <span style={{ color: "#999", fontSize: 12 }}>{t("finderReport.messageHint")}</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={200}
            rows={3}
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          {t("finderReport.contact")}{" "}
          <span style={{ color: "#999", fontSize: 12 }}>{t("finderReport.contactHint")}</span>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={120}
            style={{ display: "block", width: "100%", padding: 8 }}
          />
        </label>

        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ padding: "8px 12px", width: "100%" }}>
          {submitting ? t("finderReport.submitting") : t("finderReport.submit")}
        </button>
      </form>

      <p style={{ marginTop: 24, fontSize: 12, color: "#999", fontFamily: "monospace", textAlign: "center" }}>
        {t("finder.tag")}: {code}
      </p>
    </main>
  );
}
