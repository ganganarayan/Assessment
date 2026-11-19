import { test } from "node:test";
import assert from "node:assert/strict";
import { isCreditExhausted } from "@/lib/ai/credit-alert";

// The strings below are the error messages generate.ts builds from each provider's reply.
test("out-of-credit replies from each provider are recognised", () => {
  assert.equal(
    isCreditExhausted('Claude 400: {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'),
    true,
  );
  assert.equal(
    isCreditExhausted('OpenAI 429: {"error":{"message":"You exceeded your current quota, please check your plan and billing details.","code":"insufficient_quota"}}'),
    true,
  );
  assert.equal(isCreditExhausted("Gemini 429: Your prepayment credits are depleted."), true);
  assert.equal(isCreditExhausted("Claude 402: payment required"), true);
});

test("ordinary failures do not raise the credit alarm", () => {
  assert.equal(isCreditExhausted('Claude 529: {"error":{"type":"overloaded_error"}}'), false);
  assert.equal(isCreditExhausted("OpenAI 429: Rate limit reached for requests per min"), false);
  assert.equal(isCreditExhausted("The operation was aborted due to timeout"), false);
  assert.equal(isCreditExhausted("Claude 401: invalid x-api-key"), false);
});
