# Static assets and head references

## Upload flow

1. `POST /api/v1/media/prepare` `{ name, type, size, website_id? }`
2. Client uploads bytes to B2 `uploadUrl` with `authorizationToken`
3. `POST /api/v1/media/:pit` `{ filename, type, size, original_url }`
4. Use `public_url` in page/website head config

MCP `upload_asset` performs all steps.

## Page vs website assets

- **Website** `PUT /websites/:id/head-assets` → every page
- **Page** draft `config` → that page only
- Render merge order: website first, then page (append)

## Positions

- CSS always in `<head>`
- JS: `position: "head" | "body_end"` (default `body_end`)
- Prefer `defer: true` for body scripts
