/**
 * Minimal Otimififi REST client for MCP tools.
 */

export class OtmClient {
  /**
   * @param {{ baseUrl: string, token: string, fetchImpl?: typeof fetch }} opts
   */
  constructor({ baseUrl, token, fetchImpl }) {
    this.baseUrl = (baseUrl || "").replace(/\/$/, "");
    this.token = token || "";
    this.fetchImpl = fetchImpl || globalThis.fetch;
    if (!this.baseUrl) {
      throw new Error("OTIMIFIFI_API_BASE is required");
    }
    if (!this.token) {
      throw new Error("OTIMIFIFI_ACCESS_TOKEN is required");
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
    const res = await this.fetchImpl(url.toString(), init);
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
      const err = new Error(String(msg));
      // @ts-ignore
      err.status = res.status;
      // @ts-ignore
      err.payload = data;
      throw err;
    }
    if (data && data.status === "error") {
      const err = new Error(data.message || "API error");
      // @ts-ignore
      err.payload = data;
      throw err;
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

  const prepared = await client.post("/api/v1/media/prepare", {
    website_id: opts.website_id,
    name: opts.name,
    type: opts.type,
    size: bytes.length,
  });

  const uploadUrl = prepared.uploadUrl || prepared.upload_url;
  const authToken =
    prepared.authorizationToken || prepared.authorization_token;
  if (!uploadUrl || !authToken) {
    throw new Error("media/prepare did not return uploadUrl/authorizationToken");
  }

  const userScope = prepared.userScope || prepared.user_scope || "";
  const pit = prepared.pit;
  const fileNameOnB2 = `${userScope}/${pit}/${opts.name}`.replace(
    /\/+/g,
    "/"
  );

  const uploadRes = await fetch(uploadUrl, {
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
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    throw new Error(`B2 upload failed: ${uploadRes.status} ${t}`);
  }

  const downloadBase =
    prepared.downloadBaseUrl ||
    prepared.download_base_url ||
    "https://static.otimififi.com/";
  const base = downloadBase.endsWith("/") ? downloadBase : downloadBase + "/";
  const publicUrl =
    prepared.publicUrl || prepared.public_url || `${base}${fileNameOnB2}`;

  const confirmed = await client.post(`/api/v1/media/${pit}`, {
    filename: opts.name,
    type: opts.type,
    size: bytes.length,
    original_url: publicUrl,
  });

  return {
    asset_id: pit,
    public_url: confirmed?.public_url || publicUrl,
    file_type: opts.type,
    filename: opts.name,
    size: bytes.length,
    prepare: prepared,
    confirm: confirmed,
  };
}
