# Publish flow

```
draft (version ≤ 0)
  PUT /pages/:id/drafts/0   ← html + config
  POST /pages/:id/drafts/0/commit  → { version: N }  (N > 0)
  PUT /pages/:id/change-version { version: N }
```

MCP `publish_page` runs commit + change-version when `set_live=true`.

Live URL:

- Site: `get_website` → `preview` (custom domain if ready, else `{sld}.default-domain`)
- Page: `list_pages` → `full_url`

Unpublished drafts are not on the public host until change-version points at a positive release.
