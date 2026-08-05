"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n/use-t";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { LogoMark } from "@/components/Logo";

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
      <main className="mx-auto max-w-md px-4 py-16 text-center sm:py-20">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-navy-900">{t("finderReport.thanksTitle")}</h1>
        <p className="mt-3 leading-relaxed text-slate-600">{t("finderReport.thanksBody")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <div className="text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-900">{t("finderReport.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("finderReport.intro")}</p>
      </div>

      {(personName || personDetails) && (
        <section className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-start gap-3">
            {personName && (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy-900 text-lg font-semibold text-white" aria-hidden>
                {personName.trim().charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              {personName && <p className="text-lg font-semibold text-navy-900">{personName}</p>}
              {personDetails && (
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{personDetails}</p>
              )}
            </div>
          </div>
        </section>
      )}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5">
        <div>
          <Button type="button" variant="outline" size="lg" onClick={captureGps} disabled={gpsBusy} className="w-full">
            {gpsBusy ? t("finderReport.gpsBusy") : t("finderReport.useGps")}
          </Button>
          {gps && (
            <Alert variant="success" className="mt-2">
              {t("finderReport.gpsCaptured")} ({gps.lat.toFixed(5)}, {gps.lon.toFixed(5)})
            </Alert>
          )}
          {gpsError && (
            <Alert variant="destructive" className="mt-2">
              {t("finderReport.gpsError")}
            </Alert>
          )}
        </div>

        <div>
          <Label htmlFor="finder-address">
            {t("finderReport.address")}{" "}
            <span className="font-normal text-slate-400">{t("finderReport.addressHint")}</span>
          </Label>
          <Input
            id="finder-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={200}
          />
        </div>

        <div>
          <Label htmlFor="finder-message">
            {t("finderReport.message")}{" "}
            <span className="font-normal text-slate-400">{t("finderReport.messageHint")}</span>
          </Label>
          <Textarea
            id="finder-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={200}
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="finder-contact">
            {t("finderReport.contact")}{" "}
            <span className="font-normal text-slate-400">{t("finderReport.contactHint")}</span>
          </Label>
          <Input
            id="finder-contact"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={120}
          />
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" variant="accent" size="lg" disabled={submitting} className="w-full">
          {submitting ? t("finderReport.submitting") : t("finderReport.submit")}
        </Button>
      </form>

      <p className="mt-10 text-center font-mono text-xs text-slate-400">
        {t("finder.tag")}: {code}
      </p>
    </main>
  );
}
