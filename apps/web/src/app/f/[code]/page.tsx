import { getT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict";

interface PageProps {
  params: Promise<{ code: string }>;
}

type TagState = "inactive" | "active" | "registered" | "deprecated";

// Public finder route. Per requirements §5.3, the QR encodes a URL of the
// form https://<domain>/f/<code>. Both the caregiver (with the LNF app
// installed) and a finder (no app) hit this same URL. The first SSR hit on
// an inactive tag flips it to 'active' on the API side — that's the
// "manufacturer scanned the printed QR" signal.
async function lookupTagState(code: string): Promise<TagState | "not_found"> {
  const target = process.env.API_PROXY_TARGET ?? "http://localhost:3001";
  const res = await fetch(`${target}/api/public/tag/${encodeURIComponent(code)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return "not_found";
  if (!res.ok) return "not_found";
  const data = (await res.json()) as { state: TagState };
  return data.state;
}

// Map state → translation key pair. Deliberately reuse "this tag is new"
// wording for inactive — we don't want a passing finder to know they just
// activated the tag.
const COPY_FOR_STATE: Record<TagState, { title: DictKey; body: DictKey }> = {
  inactive: { title: "finder.title", body: "finder.body" },
  active: { title: "finder.titleActive", body: "finder.bodyActive" },
  registered: { title: "finder.titleRegistered", body: "finder.bodyRegistered" },
  deprecated: { title: "finder.titleDeprecated", body: "finder.bodyDeprecated" },
};

export default async function FinderPage({ params }: PageProps) {
  const { code } = await params;
  const { t } = await getT();
  const state = await lookupTagState(code);
  // not_found falls through to the inactive copy — same "this tag is new"
  // wording avoids leaking that the code doesn't exist.
  const copy = COPY_FOR_STATE[state === "not_found" ? "inactive" : state];

  return (
    <main style={{ maxWidth: 480, margin: "64px auto", fontFamily: "system-ui", textAlign: "center", padding: 16 }}>
      <h1 style={{ fontSize: 24 }}>{t(copy.title)}</h1>
      <p style={{ color: "#444" }}>{t(copy.body)}</p>
      <p style={{ marginTop: 24, fontSize: 12, color: "#999", fontFamily: "monospace" }}>
        {t("finder.tag")}: {code}
      </p>
    </main>
  );
}
