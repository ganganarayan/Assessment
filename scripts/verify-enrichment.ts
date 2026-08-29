/**
 * Enrichment verification (no DB): the pure helpers behind geo + device capture
 * and Meta advanced-matching hashing.
 *   - parseUserAgent (src/lib/user-agent.ts)
 *   - readGeoHeaders (src/lib/geo.ts)
 *   - hashCityState / hashCountry / hashZip (src/lib/meta/hash.ts)
 *
 *   npx tsx scripts/verify-enrichment.ts
 */
import { parseUserAgent } from "../src/lib/user-agent";
import { readGeoHeaders } from "../src/lib/geo";
import { hashCityState, hashCountry, hashZip, sha256Hex } from "../src/lib/meta/hash";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Enrichment verification\n");

// --- parseUserAgent ---
{
  const android = parseUserAgent("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36");
  expect("android: mobile", android.deviceType === "mobile", JSON.stringify(android));
  expect("android: Chrome", android.browser === "Chrome");
  expect("android: Android OS", android.os === "Android");

  const iphone = parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1");
  expect("iphone: mobile", iphone.deviceType === "mobile", JSON.stringify(iphone));
  expect("iphone: Safari", iphone.browser === "Safari");
  expect("iphone: iOS", iphone.os === "iOS");

  const win = parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
  expect("windows: desktop", win.deviceType === "desktop", JSON.stringify(win));
  expect("windows: Windows", win.os === "Windows");

  const edge = parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 Edg/126.0.0.0");
  expect("edge detected before chrome", edge.browser === "Edge", JSON.stringify(edge));

  const ipad = parseUserAgent("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Safari/604.1");
  expect("ipad: tablet", ipad.deviceType === "tablet", JSON.stringify(ipad));

  const empty = parseUserAgent("");
  expect("empty UA: all null", empty.deviceType === null && empty.browser === null && empty.os === null);
}

// --- readGeoHeaders ---
{
  const hdr: Record<string, string> = {
    "cf-ipcountry": "IN",
    "cf-ipcity": "Mumbai",
    "cf-region": "Maharashtra",
    "cf-postal-code": "400001",
    "cf-timezone": "Asia/Kolkata",
  };
  const g = readGeoHeaders((k) => hdr[k] ?? null);
  expect("geo: country IN", g.country === "IN", JSON.stringify(g));
  expect("geo: city Mumbai", g.city === "Mumbai");
  expect("geo: region Maharashtra", g.region === "Maharashtra");
  expect("geo: postal 400001", g.postalCode === "400001");
  expect("geo: tz Asia/Kolkata", g.timezone === "Asia/Kolkata");

  const none = readGeoHeaders(() => null);
  expect("geo: empty -> all null", none.country === null && none.city === null);

  const xx = readGeoHeaders((k) => (k === "cf-ipcountry" ? "XX" : null));
  expect("geo: XX country dropped", xx.country === null, JSON.stringify(xx));
}

// --- Meta geo hashing (lowercase, strip, sha256) ---
{
  expect("hashCityState strips + lowercases", hashCityState("New Delhi") === sha256Hex("newdelhi"));
  expect("hashCountry 2-letter lower", hashCountry("IN") === sha256Hex("in"));
  expect("hashCountry rejects long", hashCountry("India") === sha256Hex("in")); // sliced to 2
  expect("hashZip strips spaces", hashZip(" 400 001 ") === sha256Hex("400001"));
  expect("hashCityState empty -> null", hashCityState("  ") === null);
  expect("hashCountry empty -> null", hashCountry("") === null);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
