# Static assets and head references

## Upload flow

1. Call `upload_asset_from_path` for a local binary file, or `upload_asset` for
   text/base64 content.
2. MCP performs the prepare, B2 transfer, and confirm calls internally.
3. Use only the returned `public_url` in page HTML or website/page head config.

The B2 `uploadUrl` and `authorizationToken` are temporary internal credentials.
They must never be returned to the model, placed in HTML, or written to logs.

For an image in page body HTML:

```html
<img src="https://static.otimififi.com/.../hero.png" alt="Hero">
```

For CSS/JS, use the same `public_url` in `cssFileLinks` or `jsFileLinks`.

## Page vs website assets

- **Website** `PUT /websites/:id/head-assets` → every page
- **Page** draft `config` → that page only
- Render merge order: website first, then page (append)

## Positions

- CSS always in `<head>`
- JS: `position: "head" | "body_end"` (default `body_end`)
- Prefer `defer: true` for body scripts

## Local file policy

`upload_asset_from_path` accepts absolute paths only. The path must resolve
inside `OTIMIFIFI_ASSET_ROOTS`; when unset, the MCP process working directory
is the default root. The tool infers common image MIME types from the file
extension and returns a SHA-256 hash.
