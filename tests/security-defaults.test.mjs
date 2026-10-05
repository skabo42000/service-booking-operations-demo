import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyHuman } from "../lib/protection.ts";
import { POST } from "../app/api/auth/email/start/route.ts";

test("email-code demo fails closed unless displayed-code mode is explicitly enabled", async () => {
  const original = process.env.DEMO_SHOW_LOGIN_CODE;
  try {
    delete process.env.DEMO_SHOW_LOGIN_CODE;
    const request = new Request("https://demo.example/api/auth/email/start", {
      method: "POST", headers: { origin: "https://demo.example", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "synthetic@example.com" }),
    });
    const response = await POST(request);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await response.json()).demoCode, undefined);
  } finally {
    if (original === undefined) delete process.env.DEMO_SHOW_LOGIN_CODE;
    else process.env.DEMO_SHOW_LOGIN_CODE = original;
  }
});

test("production human check requires configuration outside Vercel too", async () => {
  const keys = ["NODE_ENV", "VERCEL", "BOT_CHECK", "TURNSTILE_SECRET_KEY"];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.NODE_ENV = "production";
    for (const key of keys.slice(1)) delete process.env[key];
    const result = await verifyHuman(undefined);
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  } finally {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});
