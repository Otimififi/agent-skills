/**
 * Minimal Otimififi REST client for MCP tools.
 */

import { createHash } from "node:crypto";

export class McpOperationError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "McpOperationError";
    this.error_code = options.errorCode || "MCP_ERROR";
    this.stage = options.stage || "unknown";
    this.retryable = Boolean(options.retryable);
    this.status = options.status;
    this.payload = options.payload;
    this.details = options.details;
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function wrapUploadError(error, errorCode, stage, details = {}) {
  return new McpOperationError(error?.message || String(error), {
    errorCode,
    stage,
    retryable: Boolean(error?.retryable),
    status: error?.status,
    payload: error?.payload,
    details: { ...(error?.details || {}), ...details },
  });
}

export class OtmClient {
  /**
   * @param {{ baseUrl: string, token: string, fetchImpl?: typeof fetch }} opts
   */
  constructor({ baseUrl, token, fetchImpl }) {
    this.baseUrl = (baseUrl || "").replace(/\/$/, "");
    this.token = token || "";
    this.fetchImpl = fetchImpl || globalThis.fetch;
    if (!this.baseUrl) {
      throw new McpOperationError("OTIMIFIFI_API_BASE is required", {
        errorCode: "MISSING_API_BASE",
        stage: "configuration",
      });
    }
    if (!this.token) {
      throw new McpOperationError("OTIMIFIFI_ACCESS_TOKEN is required", {
        errorCode: "MISSING_ACCESS_TOKEN",
        stage: "configuration",
      });
    }
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   * @param {Record<string, string>} [query]
   */
  async request(method, path, body, query) {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, String(v));
        }
      }
    }
    /** @type {Record<string, string>} */
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    /** @type {RequestInit} */
    const init = { method, headers };
    if (body !== undefined && body !== null) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await this.fetchImpl(url.toString(), init);
    } catch (error) {
      throw new McpOperationError("API request failed", {
        errorCode: "API_UNREACHABLE",
        stage: "api_request",
        retryable: true,
        details: { reason: error?.message || String(error) },
      });
    }
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg =
        (data && (data.message || data.error || data.detail)) ||
        `HTTP ${res.status}`;
      throw new McpOperationError(String(msg), {
        errorCode: data?.error_code || data?.code || `HTTP_${res.status}`,
        stage: "api_request",
        retryable: isRetryableStatus(res.status),
        status: res.status,
        payload: data,
      });
    }
    if (data && data.status === "error") {
      throw new McpOperationError(data.message || "API error", {
        errorCode: data.error_code || data.code || "API_ERROR",
        stage: "api_request",
        payload: data,
      });
    }
    return data?.payload !== undefined ? data.payload : data;
  }

  get(path, query) {
    return this.request("GET", path, undefined, query);
  }
  post(path, body) {
    return this.request("POST", path, body);
  }
  put(path, body) {
    return this.request("PUT", path, body);
  }
  del(path, body) {
    return this.request("DELETE", path, body);
  }
}

/**
 * Upload bytes via prepare → B2 → confirm.
 * @param {OtmClient} client
 * @param {{
 *   name: string,
 *   type: string,
 *   content: Uint8Array | ArrayBuffer | string,
 *   website_id?: string,
 *   encoding?: 'utf8' | 'base64'
 * }} opts
 */
export async function uploadAsset(client, opts) {
  let bytes;
  if (typeof opts.content === "string") {
    if (opts.encoding === "base64") {
      bytes = Buffer.from(opts.content, "base64");
    } else {
      bytes = Buffer.from(opts.content, "utf8");
    }
  } else if (opts.content instanceof ArrayBuffer) {
    bytes = Buffer.from(opts.content);
  } else {
    bytes = Buffer.from(opts.content);
  }

  return uploadAssetBytes(client, { ...opts, bytes });
}

/**
 * Upload already-read bytes. The MCP layer validates filesystem paths before
 * reading local assets, then uses this function for the common upload flow.
 */
export async function uploadAssetBytes(client, opts) {
  const bytes = Buffer.isBuffer(opts.bytes)
    ? opts.bytes
    : Buffer.from(opts.bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  let prepared;
  try {
    prepared = await client.post("/api/v1/media/prepare", {
      website_id: opts.website_id,
      name: opts.name,
      type: opts.type,
      size: bytes.length,
    });
  } catch (error) {
    throw wrapUploadError(error, "UPLOAD_PREPARE_FAILED", "media_prepare");
  }

  const uploadUrl = prepared?.uploadUrl || prepared?.upload_url;
  const authToken =
    prepared?.authorizationToken || prepared?.authorization_token;
  if (!uploadUrl || !authToken) {
    throw new McpOperationError(
      "media/prepare did not return upload credentials",
      {
        errorCode: "UPLOAD_PREPARE_INVALID_RESPONSE",
        stage: "media_prepare",
      }
    );
  }

  const userScope = prepared?.userScope || prepared?.user_scope || "";
  const pit = prepared?.pit;
  if (!pit) {
    throw new McpOperationError("media/prepare did not return an asset id", {
      errorCode: "UPLOAD_PREPARE_INVALID_RESPONSE",
      stage: "media_prepare",
    });
  }
  const fileNameOnB2 = `${userScope}/${pit}/${opts.name}`.replace(
    /\/+/g,
    "/"
  );

  let uploadRes;
  try {
    uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: authToken,
        "X-Bz-File-Name": encodeURIComponent(fileNameOnB2).replace(/%2F/g, "/"),
        "Content-Type": opts.type,
        "Content-Length": String(bytes.length),
        "X-Bz-Content-Sha1": "do_not_verify",
      },
      body: bytes,
    });
  } catch (error) {
    throw new McpOperationError("storage upload request failed", {
      errorCode: "UPLOAD_TRANSFER_FAILED",
      stage: "storage_upload",
      retryable: true,
      details: { reason: error?.message || String(error) },
    });
  }
  if (!uploadRes.ok) {
    await uploadRes.text();
    throw new McpOperationError("storage upload failed", {
      errorCode: "UPLOAD_TRANSFER_FAILED",
      stage: "storage_upload",
      retryable: isRetryableStatus(uploadRes.status),
      status: uploadRes.status,
      details: { upstream_status: uploadRes.status },
    });
  }

  const downloadBase =
    prepared?.downloadBaseUrl ||
    prepared?.download_base_url ||
    "https://static.otimififi.com/";
  const base = downloadBase.endsWith("/") ? downloadBase : downloadBase + "/";
  const publicUrl =
    prepared?.publicUrl || prepared?.public_url || `${base}${fileNameOnB2}`;

  let confirmed;
  try {
    confirmed = await client.post(`/api/v1/media/${pit}`, {
      filename: opts.name,
      type: opts.type,
      size: bytes.length,
      original_url: publicUrl,
    });
  } catch (error) {
    throw wrapUploadError(error, "UPLOAD_CONFIRM_FAILED", "media_confirm");
  }

  return {
    asset_id: pit,
    public_url: confirmed?.public_url || confirmed?.original_url || publicUrl,
    mime_type: opts.type,
    file_type: opts.type,
    filename: opts.name,
    size: bytes.length,
    sha256,
  };
}
