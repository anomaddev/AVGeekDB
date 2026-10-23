import { DEMO_KEY, MAX_LIMIT, FILTERS } from "@avgeekdb/api";

export default function Docs() {
  const limit = process.env.RATE_LIMIT_PER_MINUTE ?? "60";
  return (
    <main>
      <h1>API reference</h1>
      <p>Base URL: <code>https://&lt;domain&gt;/v1</code>. Free, but every request needs an API key. Machine-readable spec: <a href="/openapi.yaml">openapi.yaml</a>.</p>
      <h2>Authentication</h2>
      <p>Send your key in the <code>x-api-key</code> header. Create and revoke keys in the dashboard. Keys are shown once and stored hashed.</p>
      <pre>curl -H &quot;x-api-key: $AVGEEKDB_KEY&quot; &quot;https://&lt;domain&gt;/v1/airports?q=heathrow&quot;</pre>
      <p>Local dev (mock mode) accepts <code>{DEMO_KEY}</code>.</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>GET /v1/airports</code>: filters {FILTERS.airports.join(", ")}</li>
        <li><code>GET /v1/airlines</code>: filters {FILTERS.airlines.join(", ")}. Each airline includes <code>hubs</code>: an array of hub airport ICAO codes, primary first (<code>?hub=EGLL</code> filters by hub).</li>
        <li><code>GET /v1/aircraft</code>: filters {FILTERS.aircraft_types.join(", ")}</li>
      </ul>
      <p>Common params: <code>q</code> (free-text search), <code>limit</code> (1-{MAX_LIMIT}, default 25), <code>offset</code>.</p>
      <h2>Responses</h2>
      <pre>{`{ "data": [...], "meta": { "total": 3, "limit": 25, "offset": 0, "next_offset": null, "data_version": "2026.10.23" } }`}</pre>
      <p>Every response carries <code>x-data-version</code>. Errors: 400 bad params, 401 missing/invalid key, 403 revoked key, 429 rate limited.</p>
      <h2>Rate limits</h2>
      <p>{limit} requests/minute per key. Headers: <code>x-ratelimit-limit</code>, <code>x-ratelimit-remaining</code>, <code>x-ratelimit-reset</code>, and <code>retry-after</code> on 429.</p>
    </main>
  );
}
