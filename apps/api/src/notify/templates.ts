export interface AlertParams {
  personLabel: string; // tag label or person name — never both; privacy-bounded
  locationText: string; // address text or "ubicación GPS compartida"
  ackUrl: string;
}

const ES = {
  subject: (p: AlertParams) => `Alerta LNF: reportaron a ${p.personLabel}`,
  text: (p: AlertParams) =>
    `Alguien reportó a ${p.personLabel} (${p.locationText}). Confirma que recibiste esta alerta: ${p.ackUrl}`,
};
const EN = {
  subject: (p: AlertParams) => `LNF alert: ${p.personLabel} was reported found`,
  text: (p: AlertParams) =>
    `Someone reported finding ${p.personLabel} (${p.locationText}). Acknowledge this alert: ${p.ackUrl}`,
};
const PT_BR = {
  subject: (p: AlertParams) => `Alerta LNF: reportaram ${p.personLabel}`,
  text: (p: AlertParams) =>
    `Alguém reportou ${p.personLabel} (${p.locationText}). Confirme o recebimento deste alerta: ${p.ackUrl}`,
};

// es is the LATAM default (§5.9); the handler still sends es until a caregiver
// locale preference lands (follow-up) — pt-BR/en are wired for that switch.
export function renderAlert(locale: "es" | "en" | "pt-BR", p: AlertParams): { subject: string; text: string } {
  const t = locale === "en" ? EN : locale === "pt-BR" ? PT_BR : ES;
  return { subject: t.subject(p), text: t.text(p) };
}
