#!/usr/bin/env node
/**
 * Otimififi Site MCP Server
 *
 * Env:
 *   OTIMIFIFI_API_BASE       e.g. https://api.otimififi.com
 *   OTIMIFIFI_ACCESS_TOKEN   Bearer token from POST /api/v1/access-token
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import {
  basename,
  delimiter,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { z } from "zod";
import {
  McpOperationError,
  OtmClient,
  uploadAsset,
} from "./client.js";

const SERVER_VERSION = "0.2.0";

const TOOL_NAMES = [
  "auth_status",
  "list_websites",
  "get_website",
  "create_website",
  "update_website",
  "list_pages",
  "get_page",
  "get_page_content",
  "get_draft_preview_url",
  "get_page_by_pathname",
  "get_or_create_page",
  "plan_static_page_import",
  "apply_static_page_import",
  "create_page",
  "update_page_meta",
  "upsert_page_html",
  "publish_page",
  "upload_asset",
  "upload_asset_from_path",
  "set_page_assets",
  "set_website_assets",
  "get_public_urls",
  "mcp_health",
];

const MIME_TYPES = {
  ".css": "text/css",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function textResult(data) {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function redactText(value) {
  return String(value || "")
    .replace(/(authorization|token|secret)([=:]\s*)[^\s,}]+/gi, "$1$2[redacted]")
    .slice(0, 500);
}

function safeErrorDetails(err) {
  const details = {};
  if (err?.details && typeof err.details === "object") {
    for (const [key, value] of Object.entries(err.details)) {
      if (["string", "number", "boolean"].includes(typeof value)) {
        details[key] = typeof value === "string" ? redactText(value) : value;
      }
    }
  }
  const payload = err?.payload;
  if (payload && typeof payload === "object") {
    for (const key of ["code", "error_code", "request_id", "trace_id"]) {
      if (payload[key] !== undefined) details[`upstream_${key}`] = payload[key];
    }
  }
  return Object.keys(details).length ? details : undefined;
}

function errorResult(err) {
  const payload = {
    error: redactText(err?.message || String(err)),
    error_code: err?.error_code || "MCP_ERROR",
    stage: err?.stage || "unknown",
    retryable: Boolean(err?.retryable),
  };
  if (err?.status !== undefined) payload.status = err.status;
  const details = safeErrorDetails(err);
  if (details) payload.details = details;
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

function getClient() {
  return new OtmClient({
    baseUrl: process.env.OTIMIFIFI_API_BASE || "",
    token: process.env.OTIMIFIFI_ACCESS_TOKEN || "",
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pageItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.pages)) return data.pages;
  return [];
}

function pageContentSummary(page) {
  const sourceCode = page?.source_code;
  const config = page?.config;
  const assets = config && typeof config === "object" ? config : {};
  const summary = {
    source_code_length:
      typeof sourceCode === "string" ? Buffer.byteLength(sourceCode, "utf8") : 0,
    source_code_sha256:
      typeof sourceCode === "string" ? sha256(sourceCode) : null,
    config_keys:
      config && typeof config === "object" && !Array.isArray(config)
        ? Object.keys(config)
        : [],
    asset_counts: {
      css: Array.isArray(assets.cssFileLinks) ? assets.cssFileLinks.length : 0,
      js: Array.isArray(assets.jsFileLinks) ? assets.jsFileLinks.length : 0,
      inline_styles: Array.isArray(assets.inlineStyles)
        ? assets.inlineStyles.length
        : 0,
      inline_scripts: Array.isArray(assets.inlineScripts)
        ? assets.inlineScripts.length
        : 0,
    },
  };
  return summary;
}

function summarizePage(page, includeContent = false) {
  if (!page || typeof page !== "object") return page;
  const version = page.version ?? page.self_version;
  const draftVersion =
    page.draft_version ??
    (typeof version === "number" && version <= 0 ? version : null);
  const liveVersion =
    page.live_version ??
    page.published_version ??
    (typeof version === "number" && version > 0 ? version : null);
  const summary = {
    id: page.id || page.page_id,
    website_id: page.website_id,
    pathname: page.pathname,
    full_url: page.full_url,
    preview_base_url: page.preview_base_url,
    title: page.title ?? null,
    draft_title: page.draft_title ?? null,
    live_title: page.live_title ?? null,
    role: page.role,
    is_dynamic: page.is_dynamic,
    state: page.state ?? null,
    version,
    live_version: liveVersion,
    draft_version: draftVersion,
    publicly_accessible: page.publicly_accessible ?? null,
    public_accessibility_source:
      page.publicly_accessible === undefined ? "not_reported" : "api",
    ...pageContentSummary(page),
  };

  for (const field of ["versions", "releases", "drafts", "import"]) {
    if (page[field] !== undefined) summary[field] = page[field];
  }

  if (includeContent) {
    for (const field of ["source_code", "config", "react_nodes", "data_rules"]) {
      if (page[field] !== undefined) summary[field] = page[field];
    }
  }
  return summary;
}

function pageResponse(data, includeContent = false) {
  return summarizePage(data, includeContent);
}

function inspectHtmlImport(html, importMode) {
  const report = {
    extracted: [],
    sanitized: [],
    removed: [],
    allowed_url_schemes: ["http", "https", "mailto", "tel", "relative", "anchor"],
    rejected_url_schemes: ["data", "javascript", "vbscript", "file"],
  };
  if (importMode !== "full_html") return report;

  const count = (pattern) => (html.match(pattern) || []).length;
  for (const [tag, destination] of [
    ["style", "config.inlineStyles"],
    ["script", "config.inlineScripts or config.jsFileLinks"],
    ["link", "config.cssFileLinks"],
  ]) {
    const total = count(new RegExp(`<${tag}\\b`, "gi"));
    if (total) report.extracted.push({ element: tag, count: total, destination });
  }

  const unsafeUrls = /\b(href|src|action|formaction|xlink:href)\s*=\s*["']\s*([a-z][a-z0-9+.-]*):/gi;
  for (const match of html.matchAll(unsafeUrls)) {
    const scheme = match[2].toLowerCase();
    if (report.rejected_url_schemes.includes(scheme)) {
      report.removed.push({
        element: "attribute",
        attribute: match[1],
        reason: "unsafe_url_scheme",
        value_type: scheme,
      });
    }
  }

  const eventAttributes = count(/\s(on[a-z]+)\s*=\s*["']/gi);
  if (eventAttributes) {
    report.sanitized.push({
      element: "*",
      attribute: "on*",
      reason: "event_handler_removed",
      count: eventAttributes,
    });
  }

  for (const tag of ["iframe", "object", "embed", "meta", "base", "form"]) {
    const total = count(new RegExp(`<${tag}\\b`, "gi"));
    if (total) {
      report.removed.push({
        element: tag,
        reason: "dangerous_tag_removed_from_body",
        count: total,
      });
    }
  }
  return report;
}

function mimeTypeFor(name, type) {
  return type || MIME_TYPES[extname(name).toLowerCase()] || "application/octet-stream";
}

function isWithin(root, target) {
  const child = relative(root, target);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

async function readAllowedAsset(filePath) {
  if (!isAbsolute(filePath)) {
    throw new McpOperationError("asset path must be absolute", {
      errorCode: "ASSET_PATH_MUST_BE_ABSOLUTE",
      stage: "asset_read",
    });
  }

  const requested = resolve(filePath);
  let resolved;
  try {
    resolved = await realpath(requested);
  } catch {
    throw new McpOperationError("asset path does not exist", {
      errorCode: "ASSET_PATH_NOT_FOUND",
      stage: "asset_read",
    });
  }

  const configuredRoots = (process.env.OTIMIFIFI_ASSET_ROOTS || process.cwd())
    .split(delimiter)
    .filter(Boolean)
    .map((root) => resolve(root));
  const roots = await Promise.all(
    configuredRoots.map(async (root) => {
      try {
        return await realpath(root);
      } catch {
        return null;
      }
    })
  );
  if (!roots.some((root) => root && isWithin(root, resolved))) {
    throw new McpOperationError("asset path is outside the allowed roots", {
      errorCode: "ASSET_PATH_NOT_ALLOWED",
      stage: "asset_read",
    });
  }

  const info = await stat(resolved);
  if (!info.isFile()) {
    throw new McpOperationError("asset path is not a regular file", {
      errorCode: "ASSET_PATH_NOT_FILE",
      stage: "asset_read",
    });
  }
  const configuredMaxBytes = Number(process.env.OTIMIFIFI_MAX_ASSET_BYTES);
  const maxBytes =
    Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0
      ? configuredMaxBytes
      : 25 * 1024 * 1024;
  if (info.size > maxBytes) {
    throw new McpOperationError("asset exceeds the configured size limit", {
      errorCode: "ASSET_TOO_LARGE",
      stage: "asset_read",
      details: { size: info.size, max_bytes: maxBytes },
    });
  }
  return { path: resolved, bytes: await readFile(resolved) };
}

function inspectAssetReferences(html) {
  const references = [];
  const pattern = /<(img|script|source|link)\b[^>]*?\s(src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const value = match[3].trim();
    let valueType = "relative";
    if (value.startsWith("#")) valueType = "anchor";
    else if (/^data:/i.test(value)) valueType = "data";
    else if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      valueType = /^https?:/i.test(value) ? "external" : "unsafe_scheme";
    }
    references.push({
      element: match[1].toLowerCase(),
      attribute: match[2].toLowerCase(),
      value: valueType === "data" ? "[data omitted]" : value,
      value_type: valueType,
    });
  }
  return references;
}

async function upsertPageHtml(client, options) {
  const {
    page_id: pageId,
    draft_version: draftVersion = 0,
    import_mode: importMode = "body",
    html,
    title,
    config,
    create_draft_if_missing: createDraftIfMissing = true,
  } = options;
  const version = draftVersion > 0 ? -Math.abs(draftVersion) : draftVersion;
  const body = { import_mode: importMode, html };
  if (title !== undefined) body.title = title;
  if (config !== undefined) body.config = config;
  const preflight = inspectHtmlImport(html, importMode);

  const write = async () =>
    client.put(`/api/v1/pages/${pageId}/drafts/${version}`, body);
  let result;
  try {
    result = await write();
  } catch (err) {
    if (!createDraftIfMissing) throw err;
    await client.post(`/api/v1/pages/${pageId}/drafts`, {
      basedon: undefined,
      source_code: importMode === "body" ? html : "",
    });
    result = await write();
  }
  return {
    page: pageResponse(result),
    import_report: {
      preflight,
      backend: result?.import || null,
    },
  };
}

async function commitPage(client, options) {
  const {
    page_id: pageId,
    draft_version: draftVersion = 0,
    alias,
    comment,
    set_live: setLive = true,
  } = options;
  const version = draftVersion > 0 ? -Math.abs(draftVersion) : draftVersion;
  const committed = await client.post(
    `/api/v1/pages/${pageId}/drafts/${version}/commit`,
    { alias, comment }
  );
  let live = null;
  if (setLive && committed?.version != null) {
    live = await client.put(`/api/v1/pages/${pageId}/change-version`, {
      version: committed.version,
    });
  }
  return { committed, live };
}

const server = new McpServer({
  name: "otimififi-site",
  version: SERVER_VERSION,
});

server.tool(
  "mcp_health",
  "Report MCP configuration, API authentication, and registered tools",
  {},
  async () => {
    const apiBase = process.env.OTIMIFIFI_API_BASE || "";
    const tokenConfigured = Boolean(process.env.OTIMIFIFI_ACCESS_TOKEN);
    const result = {
      server: {
        name: "otimififi-site",
        version: SERVER_VERSION,
        commit: process.env.OTIMIFIFI_MCP_COMMIT || null,
      },
      api: {
        base_url: apiBase || null,
        configured: Boolean(apiBase),
        reachable: null,
        authenticated: false,
      },
      auth: { token_configured: tokenConfigured, valid: false },
      registered_tools: TOOL_NAMES,
      upload_backend: {
        status: "not_checked",
        checked: false,
        reason: "A real upload is required to check the storage backend.",
      },
      filesystem: {
        asset_roots_configured: Boolean(process.env.OTIMIFIFI_ASSET_ROOTS),
        max_asset_bytes: process.env.OTIMIFIFI_MAX_ASSET_BYTES || 25 * 1024 * 1024,
      },
      schema_version: "otimififi-site-mcp/v1",
    };

    if (!apiBase || !tokenConfigured) return textResult(result);

    try {
      await getClient().get("/api/v1/profile");
      result.api.reachable = true;
      result.api.authenticated = true;
      result.auth.valid = true;
    } catch (err) {
      result.api.reachable = err?.status !== undefined;
      result.auth.error_code = err?.error_code || "AUTH_CHECK_FAILED";
      result.auth.stage = err?.stage || "api_request";
      result.auth.retryable = Boolean(err?.retryable);
    }
    return textResult(result);
  }
);

server.tool(
  "auth_status",
  "Validate access token and return the current user profile",
  {},
  async () => {
    try {
      const client = getClient();
      const profile = await client.get("/api/v1/profile");
      return textResult({ ok: true, profile });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "list_websites",
  "List websites visible to the authenticated user",
  {
    workspace: z
      .string()
      .optional()
      .describe("personal or organization id"),
  },
  async ({ workspace }) => {
    try {
      const client = getClient();
      const sites = await client.get("/api/v1/websites", { workspace });
      return textResult(sites);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_website",
  "Get website details including public preview URL",
  { website_id: z.string() },
  async ({ website_id }) => {
    try {
      const client = getClient();
      const site = await client.get(`/api/v1/websites/${website_id}`);
      return textResult(site);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "create_website",
  "Create a new website (blank or from template)",
  {
    title: z.string().optional(),
    description: z.string().optional(),
    template_id: z.string().optional(),
    org_id: z.string().optional(),
    favicon: z.string().optional(),
  },
  async (args) => {
    try {
      const client = getClient();
      const site = await client.post("/api/v1/websites", args);
      return textResult(site);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "update_website",
  "Update website metadata (title, description, integrations, favicon)",
  {
    website_id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    favicon: z.string().optional(),
    ms_clarity: z.string().optional(),
    google_ga: z.string().optional(),
    crisp_chat: z.string().optional(),
    tawk_to: z.string().optional(),
  },
  async ({ website_id, ...body }) => {
    try {
      const client = getClient();
      const site = await client.put(`/api/v1/websites/${website_id}`, body);
      return textResult(site);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "list_pages",
  "List compact page summaries for a website (includes full_url)",
  {
    website_id: z.string(),
    include_content: z.boolean().optional().default(false),
  },
  async ({ website_id, include_content = false }) => {
    try {
      const client = getClient();
      const pages = await client.get(`/api/v1/websites/${website_id}/pages`);
      if (Array.isArray(pages)) {
        return textResult(pages.map((page) => pageResponse(page, include_content)));
      }
      return textResult({
        ...pages,
        items: pageItems(pages).map((page) =>
          pageResponse(page, include_content)
        ),
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_page",
  "Get page detail by page id",
  {
    page_id: z.string(),
    include_content: z.boolean().optional().default(false),
  },
  async ({ page_id, include_content = false }) => {
    try {
      const client = getClient();
      const page = await client.get(`/api/v1/pages/${page_id}`);
      return textResult(pageResponse(page, include_content));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_page_content",
  "Get page HTML and config explicitly (can return large content)",
  { page_id: z.string() },
  async ({ page_id }) => {
    try {
      const client = getClient();
      const page = await client.get(`/api/v1/pages/${page_id}`);
      return textResult(pageResponse(page, true));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_draft_preview_url",
  "Create a short-lived signed preview URL for a draft",
  {
    page_id: z.string(),
    draft_version: z.number().int().optional().default(0),
  },
  async ({ page_id, draft_version = 0 }) => {
    try {
      const client = getClient();
      const page = await client.get(`/api/v1/pages/${page_id}`);
      const site = await client.get(`/api/v1/websites/${page.website_id}`);
      const tokenResult = await client.get(
        `/api/v1/pages/${page_id}/preview-token`
      );
      const siteUrl = site.preview || site.url || site.preview_url;
      const token = tokenResult?.token;
      if (!siteUrl || !token) {
        throw new McpOperationError("preview token response is incomplete", {
          errorCode: "PREVIEW_URL_UNAVAILABLE",
          stage: "preview_url",
        });
      }
      const version = draft_version > 0 ? -Math.abs(draft_version) : draft_version;
      const previewUrl = `${siteUrl.replace(/\/$/, "")}/__preview__/${page_id}?version=${version}&preview_token=${encodeURIComponent(token)}`;
      return textResult({
        page_id,
        draft_version: version,
        preview_url: previewUrl,
        access: "signed_preview",
        expires_in_seconds: 600,
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

async function findPageByPath(client, websiteId, pathname, isDynamic) {
  const pages = await client.get(`/api/v1/websites/${websiteId}/pages`);
  const match = pageItems(pages).find(
    (page) =>
      page.pathname === pathname &&
      (isDynamic === undefined || Boolean(page.is_dynamic) === isDynamic)
  );
  return match || null;
}

server.tool(
  "get_page_by_pathname",
  "Find an existing page by exact pathname without returning full content",
  {
    website_id: z.string(),
    pathname: z.string().describe("Exact path without leading slash; '' for home"),
    is_dynamic: z.boolean().optional(),
  },
  async ({ website_id, pathname, is_dynamic }) => {
    try {
      const page = await findPageByPath(
        getClient(),
        website_id,
        pathname,
        is_dynamic
      );
      if (!page) {
        throw new McpOperationError("page not found", {
          errorCode: "PAGE_NOT_FOUND",
          stage: "page_lookup",
          status: 404,
        });
      }
      return textResult(pageResponse(page));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_or_create_page",
  "Find a page by pathname or create it without duplicate-path surprises",
  {
    website_id: z.string(),
    pathname: z.string().describe("Path without leading slash; '' for home"),
    source_code: z.string().optional(),
    dynamic: z.boolean().optional(),
    nodes: z.string().optional(),
  },
  async ({ website_id, pathname, ...body }) => {
    try {
      const client = getClient();
      const existing = await findPageByPath(
        client,
        website_id,
        pathname,
        body.dynamic
      );
      if (existing) {
        return textResult({ created: false, page: pageResponse(existing) });
      }

      try {
        const page = await client.post(`/api/v1/websites/${website_id}/pages`, {
          pathname,
          ...body,
        });
        return textResult({ created: true, page: pageResponse(page) });
      } catch (createError) {
        // A concurrent creator may win between the lookup and the POST.
        if (![400, 409].includes(createError?.status)) throw createError;
        const concurrent = await findPageByPath(
          client,
          website_id,
          pathname,
          body.dynamic
        );
        if (concurrent) {
          return textResult({
            created: false,
            concurrent: true,
            page: pageResponse(concurrent),
          });
        }
        throw createError;
      }
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "plan_static_page_import",
  "Analyze a static HTML import without creating, uploading, or publishing",
  {
    website_id: z.string(),
    pathname: z.string().describe("Path without leading slash; '' for home"),
    html: z.string(),
    page_id: z.string().optional(),
    is_dynamic: z.boolean().optional(),
  },
  async ({ website_id, pathname, html, page_id, is_dynamic }) => {
    try {
      const client = getClient();
      const existing = page_id
        ? await client.get(`/api/v1/pages/${page_id}`)
        : await findPageByPath(client, website_id, pathname, is_dynamic);
      return textResult({
        plan_version: "1",
        website_id,
        pathname,
        action: existing ? "update_draft" : "create_page_and_draft",
        existing_page: existing ? pageResponse(existing) : null,
        import_report: {
          preflight: inspectHtmlImport(html, "full_html"),
        },
        asset_references: inspectAssetReferences(html),
        publish: false,
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "apply_static_page_import",
  "Create or update a draft from full HTML, optionally publish after review",
  {
    website_id: z.string(),
    pathname: z.string().describe("Path without leading slash; '' for home"),
    html: z.string(),
    page_id: z.string().optional(),
    is_dynamic: z.boolean().optional(),
    title: z.string().optional(),
    config: z.record(z.unknown()).optional(),
    publish: z.boolean().optional().default(false),
    draft_version: z.number().int().optional().default(0),
    alias: z.string().optional(),
    comment: z.string().optional(),
  },
  async ({
    website_id,
    pathname,
    html,
    page_id,
    is_dynamic,
    title,
    config,
    publish = false,
    draft_version = 0,
    alias,
    comment,
  }) => {
    try {
      const client = getClient();
      let page = page_id
        ? await client.get(`/api/v1/pages/${page_id}`)
        : await findPageByPath(client, website_id, pathname, is_dynamic);
      let created = false;
      if (!page) {
        page = await client.post(`/api/v1/websites/${website_id}/pages`, {
          pathname,
          dynamic: is_dynamic,
        });
        created = true;
      }

      const importResult = await upsertPageHtml(client, {
        page_id: page.id || page.page_id,
        draft_version,
        import_mode: "full_html",
        html,
        title,
        config,
      });
      const commit = publish
        ? await commitPage(client, {
            page_id: page.id || page.page_id,
            draft_version,
            alias,
            comment,
            set_live: true,
          })
        : null;
      const finalPage = await client.get(`/api/v1/pages/${page.id || page.page_id}`);
      return textResult({
        created,
        published: Boolean(publish),
        page: pageResponse(finalPage),
        import_report: importResult.import_report,
        commit,
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "create_page",
  "Create a page under a website",
  {
    website_id: z.string(),
    pathname: z.string().describe("Path without leading slash, '' for home"),
    source_code: z.string().optional(),
    dynamic: z.boolean().optional(),
    nodes: z.string().optional(),
  },
  async ({ website_id, ...body }) => {
    try {
      const client = getClient();
      const page = await client.post(
        `/api/v1/websites/${website_id}/pages`,
        body
      );
      return textResult(pageResponse(page));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "update_page_meta",
  "Update page pathname / role / dynamic flags",
  {
    page_id: z.string(),
    pathname: z.string().optional(),
    is_dynamic: z.boolean().optional(),
    role: z.enum(["index", "content_detail", "not_found"]).optional(),
    meta_tags: z.record(z.unknown()).optional(),
  },
  async ({ page_id, ...body }) => {
    try {
      const client = getClient();
      const page = await client.put(`/api/v1/pages/${page_id}`, body);
      return textResult(pageResponse(page));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "upsert_page_html",
  "Write HTML into a page draft. import_mode=body (default) or full_html.",
  {
    page_id: z.string(),
    draft_version: z
      .number()
      .int()
      .optional()
      .describe("Draft version number (0 or negative). Default 0"),
    import_mode: z.enum(["body", "full_html"]).optional(),
    html: z.string().describe("Body fragment or full HTML document"),
    title: z.string().optional(),
    config: z.record(z.unknown()).optional(),
    create_draft_if_missing: z.boolean().optional(),
  },
  async ({
    page_id,
    draft_version = 0,
    import_mode = "body",
    html,
    title,
    config,
    create_draft_if_missing = true,
  }) => {
    try {
      const client = getClient();
      return textResult(
        await upsertPageHtml(client, {
          page_id,
          draft_version,
          import_mode,
          html,
          title,
          config,
          create_draft_if_missing,
        })
      );
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "publish_page",
  "Commit a draft and optionally set it as the live version",
  {
    page_id: z.string(),
    draft_version: z.number().int().optional().default(0),
    alias: z.string().optional(),
    comment: z.string().optional(),
    set_live: z.boolean().optional().default(true),
  },
  async ({ page_id, draft_version = 0, alias, comment, set_live = true }) => {
    try {
      const client = getClient();
      const commit = await commitPage(client, {
        page_id,
        draft_version,
        alias,
        comment,
        set_live,
      });
      const page = await client.get(`/api/v1/pages/${page_id}`);
      return textResult({ ...commit, page: pageResponse(page) });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "upload_asset",
  "Upload a text/binary asset (CSS/JS/image). Returns only safe metadata.",
  {
    name: z.string(),
    type: z
      .string()
      .describe("MIME type e.g. text/css, application/javascript, image/png"),
    content: z.string(),
    encoding: z.enum(["utf8", "base64"]).optional().default("utf8"),
    website_id: z.string().optional(),
  },
  async (args) => {
    try {
      const client = getClient();
      const result = await uploadAsset(client, args);
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "upload_asset_from_path",
  "Upload a local file after validating its allowed workspace path",
  {
    path: z.string().describe("Absolute path under OTIMIFIFI_ASSET_ROOTS"),
    name: z.string().optional(),
    type: z.string().optional().describe("MIME type; inferred from the file extension when omitted"),
    website_id: z.string().optional(),
  },
  async ({ path, name, type, website_id }) => {
    try {
      const asset = await readAllowedAsset(path);
      const filename = name || basename(asset.path);
      if (basename(filename) !== filename) {
        throw new McpOperationError("asset name must be a file name", {
          errorCode: "ASSET_NAME_INVALID",
          stage: "asset_read",
        });
      }
      const result = await uploadAsset(getClient(), {
        name: filename,
        type: mimeTypeFor(filename, type),
        content: asset.bytes,
        website_id,
      });
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "set_page_assets",
  "Set page draft config head assets (css/js links and inline)",
  {
    page_id: z.string(),
    draft_version: z.number().int().optional().default(0),
    config: z.record(z.unknown()).describe("Page config object with cssFileLinks, jsFileLinks, etc."),
  },
  async ({ page_id, draft_version = 0, config }) => {
    try {
      const client = getClient();
      const version = draft_version > 0 ? -Math.abs(draft_version) : draft_version;
      const result = await client.put(
        `/api/v1/pages/${page_id}/drafts/${version}`,
        { config }
      );
      return textResult(pageResponse(result));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "set_website_assets",
  "Set website-level head assets merged into every page",
  {
    website_id: z.string(),
    head_assets: z
      .record(z.unknown())
      .describe("cssFileLinks, jsFileLinks, inlineStyles, inlineScripts"),
  },
  async ({ website_id, head_assets }) => {
    try {
      const client = getClient();
      const result = await client.put(
        `/api/v1/websites/${website_id}/head-assets`,
        { head_assets }
      );
      return textResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_public_urls",
  "Return public site URL and page full URLs",
  {
    website_id: z.string(),
    page_id: z.string().optional(),
  },
  async ({ website_id, page_id }) => {
    try {
      const client = getClient();
      const site = await client.get(`/api/v1/websites/${website_id}`);
      const pages = await client.get(`/api/v1/websites/${website_id}/pages`);
      const list = Array.isArray(pages) ? pages : pages?.items || pages || [];
      let page = null;
      if (page_id) {
        page =
          list.find((p) => p.id === page_id) ||
          (await client.get(`/api/v1/pages/${page_id}`));
      }
      return textResult({
        website_id,
        site_url: site.preview || site.url || site.preview_url,
        preview: site.preview,
        page: page
          ? {
              id: page.id,
              pathname: page.pathname,
              full_url: page.full_url,
              preview_base_url: page.preview_base_url,
            }
          : null,
        pages: list.map((p) => ({
          id: p.id,
          pathname: p.pathname,
          full_url: p.full_url,
        })),
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
