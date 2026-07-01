// Apple Universal Links manifest. Empty `details` today so no app claims
// /f/<code> — the finder page renders in the browser. Once the Expo app
// ships, add an entry:
//   { "appID": "TEAMID.com.lnf.mobile", "paths": ["/f/*"] }
// iOS refuses to fetch this file if the Content-Type isn't application/json.
export function GET() {
  return new Response(
    JSON.stringify({
      applinks: {
        apps: [],
        details: [],
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
