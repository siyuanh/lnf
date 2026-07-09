import { Redirect } from "expo-router";

// Entry point: the AuthGate in _layout will move the user to the right place
// once auth state resolves; sending them to /tags is the signed-in default.
export default function Index() {
  return <Redirect href="/(app)/tags" />;
}
