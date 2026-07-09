import Constants from "expo-constants";

// Expo statically inlines EXPO_PUBLIC_* at build time. Declare the shape we use
// so we don't need @types/node's full `process` in a React Native tsconfig.
declare const process: { env: { EXPO_PUBLIC_API_BASE_URL?: string } };

// API base URL comes from app.json → expo.extra.apiBaseUrl, overridable at
// runtime via the EXPO_PUBLIC_API_BASE_URL env for local dev against a laptop.
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  "http://localhost:3001";
