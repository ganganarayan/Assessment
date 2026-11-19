import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSlotAfter, emailAccountKey } from "@/lib/email/pace";

test("the next slot is 10 to 20 seconds after the previous one", () => {
  assert.equal(nextSlotAfter(1_000, 0), 11_000);
  assert.equal(nextSlotAfter(1_000, 0.9999999), 21_000);
  for (let i = 0; i < 200; i++) {
    const gap = nextSlotAfter(0, Math.random());
    assert.ok(gap >= 10_000 && gap <= 20_000, `gap ${gap}`);
  }
});

test("workspaces pace on their own account, the platform on its own", () => {
  assert.equal(emailAccountKey(null), "platform");
  assert.equal(emailAccountKey("t1"), "t1");
});
