const API_BASE = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;

let cachedConfig: { googleSignInEnabled: boolean } | null = null;

export async function getPublicConfig(): Promise<{ googleSignInEnabled: boolean }> {
  if (cachedConfig) return cachedConfig;
  
  const res = await fetch(`${API_BASE}/api/public/config`);
  if (!res.ok) {
    return { googleSignInEnabled: false };
  }
  
  const config = (await res.json()) as { googleSignInEnabled: boolean };
  cachedConfig = config;
  return config;
}
