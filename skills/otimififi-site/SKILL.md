---
name: otimififi-site
description: Build and publish websites on Otimififi via MCP/API — create sites and pages, upload HTML/CSS/JS static assets, wire head references, and return public URLs. Use when the user wants AI-driven site building, landing pages, or static hosting on Otimififi.
---

# Otimififi Site Building (AI Users)

Use the **otimififi-site MCP** tools (or equivalent REST calls with `Authorization: Bearer <token>`).

## Prerequisites

- `OTIMIFIFI_API_BASE` — API root (e.g. `https://api.otimififi.com`)
- `OTIMIFIFI_ACCESS_TOKEN` — from `POST /api/v1/access-token` (user settings / profile)
- Never write the token into page HTML, git, or public assets

For Codex CLI installation, see [the Codex setup guide](references/codex-setup.md).
The MCP server is optional if the client can call the REST API directly, but it
is the preferred path because it provides typed tools and centralizes auth.

## Default closed loop

```
auth_status
  → create_website | list_websites
  → upload_asset (css/js/images)     # get public_url
  → create_page | list_pages
  → upsert_page_html (body | full_html)
  → set_page_assets / set_website_assets   # if not embedded in full_html
  → publish_page
  → get_public_urls                 # return live links to user
```

## Rules

1. **Discover first** — `list_websites` / `get_public_urls` before mutating.
2. **Draft then publish** — `upsert_page_html` writes drafts; call `publish_page` only when the user wants live.
3. **Assets before head** — `upload_asset` first; put returned `public_url` into `cssFileLinks` / `jsFileLinks`.
4. **HTML modes**
   - `body` (default): HTML is page body only (`source_code`).
   - `full_html`: full document; system extracts body + `<link>`/`<script>`/`style` into config.
5. **Pathnames** — no leading `/`; home page is `""`.
6. **Do not** inject secrets, `javascript:` URLs, or event-handler attributes for XSS.
7. After publish, always report **site_url** and page **full_url**.

## Tool map

| Intent | Tool |
|--------|------|
| Who am I? | `auth_status` |
| Sites CRUD | `list_websites`, `get_website`, `create_website`, `update_website` |
| Pages CRUD | `list_pages`, `get_page`, `create_page`, `update_page_meta` |
| Write HTML | `upsert_page_html` |
| Go live | `publish_page` |
| Static files | `upload_asset` |
| Head CSS/JS | `set_page_assets`, `set_website_assets` |
| Live links | `get_public_urls` |

## Head assets shape

```json
{
  "cssFileLinks": [{ "href": "https://static.otimififi.com/.../app.css" }],
  "jsFileLinks": [{ "src": "https://static.otimififi.com/.../app.js", "defer": true, "position": "body_end" }],
  "inlineStyles": [".hero{padding:4rem}"],
  "inlineScripts": [{ "code": "console.log('ok')", "position": "body_end" }]
}
```

- Page assets merge **after** website `head_assets`.
- Legacy `cssFileLink` (string) still works.

## MIME types for upload_asset

| type | ext |
|------|-----|
| `text/css` | `.css` |
| `text/javascript` / `application/javascript` | `.js` |
| `image/png` `image/jpeg` `image/gif` `image/webp` `image/svg+xml` | matching |
| `font/woff2` | `.woff2` |
| `application/json` | `.json` |

## Examples

See [examples/landing-from-html.md](examples/landing-from-html.md) and [examples/attach-css-js.md](examples/attach-css-js.md).

## Deeper references

- [references/api-map.md](references/api-map.md)
- [references/html-modes.md](references/html-modes.md)
- [references/assets-and-head.md](references/assets-and-head.md)
- [references/publish-flow.md](references/publish-flow.md)
