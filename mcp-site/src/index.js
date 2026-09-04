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
import { z } from "zod";
import { OtmClient, uploadAsset } from "./client.js";

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

function errorResult(err) {
  const payload = {
    error: err?.message || String(err),
    status: err?.status,
    details: err?.payload,
  };
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

const server = new McpServer({
  name: "otimififi-site",
  version: "0.1.0",
});

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
  "List pages for a website (includes full_url)",
  { website_id: z.string() },
  async ({ website_id }) => {
    try {
      const client = getClient();
      const pages = await client.get(`/api/v1/websites/${website_id}/pages`);
      return textResult(pages);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_page",
  "Get page detail by page id",
  { page_id: z.string() },
  async ({ page_id }) => {
    try {
      const client = getClient();
      const page = await client.get(`/api/v1/pages/${page_id}`);
      return textResult(page);
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
      return textResult(page);
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
      return textResult(page);
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
      const version = draft_version > 0 ? -Math.abs(draft_version) : draft_version;
      const body = {
        import_mode,
        html,
      };
      if (title !== undefined) body.title = title;
      if (config !== undefined) body.config = config;

      try {
        const result = await client.put(
          `/api/v1/pages/${page_id}/drafts/${version}`,
          body
        );
        return textResult(result);
      } catch (err) {
        if (!create_draft_if_missing) throw err;
        await client.post(`/api/v1/pages/${page_id}/drafts`, {
          basedon: undefined,
          source_code: import_mode === "body" ? html : "",
        });
        const result = await client.put(
          `/api/v1/pages/${page_id}/drafts/${version}`,
          body
        );
        return textResult(result);
      }
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
      const version = draft_version > 0 ? -Math.abs(draft_version) : draft_version;
      const committed = await client.post(
        `/api/v1/pages/${page_id}/drafts/${version}/commit`,
        { alias, comment }
      );
      let live = null;
      if (set_live && committed?.version != null) {
        live = await client.put(`/api/v1/pages/${page_id}/change-version`, {
          version: committed.version,
        });
      }
      const page = await client.get(`/api/v1/pages/${page_id}`);
      return textResult({ committed, live, page });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "upload_asset",
  "Upload a text/binary asset (CSS/JS/image). content is utf8 string or base64.",
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
      return textResult(result);
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
