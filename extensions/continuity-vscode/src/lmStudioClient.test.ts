import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { queryLocalLmStudio, validateLmStudioEndpoint } from "./lmStudioClient";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("LM Studio endpoint accepts only loopback HTTP", () => {
  assert.equal(validateLmStudioEndpoint("http://127.0.0.1:1234"), "http://127.0.0.1:1234/v1");
  for (const value of ["https://api.example.com", "http://192.168.1.5:1234", "http://127.0.0.1:1234/evil", "http://user@localhost:1234"]) {
    assert.throws(() => validateLmStudioEndpoint(value));
  }
});

test("LM Studio request stays local and uses OpenAI chat format", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "http://127.0.0.1:1234/v1/chat/completions");
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "local-model");
    assert.equal(body.messages[0].content, "write code");
    return new Response(JSON.stringify({ choices: [{ message: { content: "ready" } }] }), { status: 200 });
  };
  assert.equal(await queryLocalLmStudio("write code", { model: "local-model" }), "ready");
});

test("image request is embedded for a local vision model", async () => {
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.messages[0].content[1].image_url.url, "data:image/png;base64,AA==");
    return new Response(JSON.stringify({ choices: [{ message: { content: "image seen" } }] }), { status: 200 });
  };
  assert.equal(await queryLocalLmStudio("read image", { model: "vision-model", imageDataUrl: "data:image/png;base64,AA==" }), "image seen");
});
