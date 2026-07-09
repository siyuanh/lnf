import * as SecureStore from "expo-secure-store";

// Better-Auth session token, kept in the OS keychain/keystore (encrypted at
// rest) rather than AsyncStorage. This is the mobile equivalent of the web's
// session cookie; we send it as `Authorization: Bearer <token>`.
const TOKEN_KEY = "lnf_session_token";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
