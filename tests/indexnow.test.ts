import { test } from "node:test";
import assert from "node:assert/strict";
import { batches, indexNowBody, isAccepted, urlsToSend } from "../src/lib/indexnow/plan";

const current = [
  { url: "https://a.example/x", lastmod: "2026-11-15" },
  { url: "https://a.example/y", lastmod: "2026-11-01" },
  { url: "https://a.example/z", lastmod: "2026-10-01" },
  { url: "https://a.example/x", lastmod: "2026-11-15" },
];

test("only new or changed URLs are sent, each once", () => {
  const sent = new Map([
    ["https://a.example/y", "2026-11-01"],
    ["https://a.example/z", "2026-09-01"],
  ]);
  assert.deepEqual(
    urlsToSend(current, sent).map((u) => u.url),
    ["https://a.example/x", "https://a.example/z"],
  );
});

test("force resends everything, still once per URL", () => {
  assert.equal(urlsToSend(current, new Map([["https://a.example/x", "2026-11-15"]]), true).length, 3);
});

test("nothing changed means nothing sent", () => {
  const sent = new Map(current.map((u) => [u.url, u.lastmod]));
  assert.equal(urlsToSend(current, sent).length, 0);
});

test("batches split at the size and keep order", () => {
  assert.deepEqual(batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(batches([], 2), []);
});

test("body carries the host, the key and a root key file", () => {
  const body = indexNowBody({ host: "a.example", origin: "https://a.example" }, "k".repeat(32), current.slice(0, 1));
  assert.deepEqual(body, {
    host: "a.example",
    key: "k".repeat(32),
    keyLocation: "https://a.example/indexnow.txt",
    urlList: ["https://a.example/x"],
  });
});

test("only 200 and 202 count as accepted", () => {
  assert.equal(isAccepted(200), true);
  assert.equal(isAccepted(202), true);
  for (const s of [0, 400, 403, 422, 429, 500]) assert.equal(isAccepted(s), false);
});
