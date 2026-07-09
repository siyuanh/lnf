import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { signIn as apiSignIn, signUp as apiSignUp } from "./api";
import { clearToken, getToken, setToken } from "./token-store";

interface AuthState {
  ready: boolean; // false until we've checked SecureStore on launch
  signedIn: boolean;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, phone?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  // On launch, a stored token means we were signed in. We don't hard-verify it
  // here (a stale token just yields 401s that the screens handle by bouncing to
  // login); this keeps startup instant.
  useEffect(() => {
    getToken()
      .then((token) => setEmail(token ? "" : null))
      .finally(() => setReady(true));
  }, []);

  async function signIn(e: string, password: string) {
    const res = await apiSignIn(e, password);
    await setToken(res.token);
    setEmail(res.email);
  }

  async function signUp(e: string, password: string, name: string, phone?: string) {
    const res = await apiSignUp(e, password, name, phone);
    await setToken(res.token);
    setEmail(res.email);
  }

  async function signOut() {
    await clearToken();
    setEmail(null);
  }

  return (
    <AuthContext.Provider
      value={{ ready, signedIn: email !== null, email: email || null, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
