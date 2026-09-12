import assert from "node:assert/strict";
import test from "node:test";

import {
  McpOperationError,
  OtmClient,
  uploadAsset,
} from "../src/client.js";

test("OtmClient returns stable structured API errors", async () => {
  const client = new OtmClient({
    baseUrl: "https://api.example.test",
    token: "test-token",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          status: "error",
          message: "forbidden",
          error_code: "FORBIDDEN",
        }),
        { status: 403, headers: { "content-type": "application/json" } }
      ),
  });

  await assert.rejects(client.get("/api/v1/profile"), (error) => {
    assert.equal(error.error_code, "FORBIDDEN");
    assert.equal(error.stage, "api_request");
    assert.equal(error.status, 403);
    assert.equal(error.retryable, false);
    return true;
  });
});

test("uploadAsset returns safe metadata without temporary credentials", async () => {
  const client = {
    async post(path) {
      if (path === "/api/v1/media/prepare") {
        return {
          uploadUrl: "https://storage.example.test/upload",
          authorizationToken: "temporary-secret",
          userScope: "user-1",
          pit: "asset-1",
          downloadBaseUrl: "https://static.example.test/",
        };
      }
      assert.equal(path, "/api/v1/media/asset-1");
      return { authorizationToken: "not-returned" };
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 200 });
  try {
    const result = await uploadAsset(client, {
      name: "app.css",
      type: "text/css",
      content: "body { color: red; }",
    });

    assert.deepEqual(Object.keys(result).sort(), [
      "asset_id",
      "file_type",
      "filename",
      "mime_type",
      "public_url",
      "sha256",
      "size",
    ]);
    assert.equal(result.asset_id, "asset-1");
    assert.equal(result.mime_type, "text/css");
    assert.equal(result.size, 20);
    assert.equal("authorizationToken" in result, false);
    assert.equal("prepare" in result, false);
    assert.equal("confirm" in result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uploadAsset reports storage failures by stage", async () => {
  const client = {
    async post(path) {
      assert.equal(path, "/api/v1/media/prepare");
      return {
        uploadUrl: "https://storage.example.test/upload",
        authorizationToken: "temporary-secret",
        userScope: "user-1",
        pit: "asset-1",
      };
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("bad", { status: 400 });
  try {
    await assert.rejects(
      uploadAsset(client, {
        name: "image.png",
        type: "image/png",
        content: "png",
      }),
      (error) => {
        assert.ok(error instanceof McpOperationError);
        assert.equal(error.error_code, "UPLOAD_TRANSFER_FAILED");
        assert.equal(error.stage, "storage_upload");
        assert.equal(error.retryable, false);
        assert.equal(error.status, 400);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
