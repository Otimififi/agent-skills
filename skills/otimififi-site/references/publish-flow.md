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

Use `get_draft_preview_url` for unpublished content. A draft URL must not be
reported as live unless the platform explicitly confirms its public state and
positive release version. The public-host behavior of version `0` is platform
configuration, so clients should treat `publicly_accessible: null` as unknown
and verify after publishing.
