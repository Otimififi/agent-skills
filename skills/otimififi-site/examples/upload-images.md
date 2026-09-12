# Example: upload images and use public URLs in HTML

Use this flow when an image exists in the local workspace:

```text
1. mcp_health {}
2. list_websites {}
3. upload_asset_from_path {
     website_id: "35mdh5",
     path: "/workspace/assets/hero.png",
     name: "hero.png",
     type: "image/png"
   }
   -> { asset_id, public_url, mime_type, size, sha256 }
4. plan_static_page_import {
     website_id: "35mdh5",
     pathname: "hello-mcp",
     html: "<main><img src=\"IMAGE_PUBLIC_URL\" alt=\"Hero\"></main>"
   }
5. apply_static_page_import {
     website_id: "35mdh5",
     pathname: "hello-mcp",
     html: "<main><img src=\"IMAGE_PUBLIC_URL\" alt=\"Hero\"></main>",
     publish: false
   }
6. get_draft_preview_url { page_id: "<page id>" }
7. publish_page { page_id: "<page id>" }  # only after approval
8. get_public_urls { website_id: "35mdh5", page_id: "<page id>" }
```

Replace `IMAGE_PUBLIC_URL` with the exact `public_url` returned by the upload
tool. Do not copy `uploadUrl`, `authorizationToken`, or a local filesystem path
into the HTML.

For multiple images, upload each file first and keep a local mapping from the
filename to its returned `public_url` before composing the HTML. Prefer
`upload_asset_from_path` for binary files; base64 through `upload_asset` is a
fallback for small files only.

The MCP process must be allowed to read the workspace path:

```bash
export OTIMIFIFI_ASSET_ROOTS=/workspace/assets
```
