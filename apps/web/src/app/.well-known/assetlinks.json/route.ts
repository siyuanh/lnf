// Android App Links manifest. Empty array means no app currently claims
// this domain, so /f/<code> stays in the browser. When the Expo Android
// build ships, push an entry of the form:
//   {
//     "relation": ["delegate_permission/common.handle_all_urls"],
//     "target": {
//       "namespace": "android_app",
//       "package_name": "com.lnf.mobile",
//       "sha256_cert_fingerprints": ["<hex>:..."]
//     }
//   }
export function GET() {
  return new Response("[]", {
    headers: { "content-type": "application/json" },
  });
}
