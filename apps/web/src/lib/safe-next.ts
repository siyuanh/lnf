/**
 * Guard against open-redirect attacks via ?next= parameter.
 * Only allows relative internal paths starting with a single `/`.
 * Rejects:
 * - null/undefined
 * - Protocol-relative URLs (`//evil.com`)
 * - Absolute URLs (`http://...`, `https://...`)
 * - Backslash variants (`/\evil.com`)
 *
 * @param next - The ?next= parameter value from the URL
 * @returns The sanitized path if safe, null otherwise
 */
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
