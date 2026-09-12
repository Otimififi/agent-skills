# Response Shapes

The REST API commonly wraps successful responses as:

```json
{
  "status": "success",
  "payload": {}
}
```

The MCP client unwraps `payload` before returning a tool result. A response is
treated as an error when the HTTP status is not successful or when the JSON
body has `status: "error"`.

## MCP Success Results

MCP tools return a text content block containing formatted JSON. The exact
shape depends on the tool, but large page bodies are not returned unless the
caller asks for them.

### Page summary

`list_pages`, `get_page`, page mutations, and `get_page_by_pathname` return
metadata such as:

```json
{
  "id": "page-id",
  "website_id": "website-id",
  "pathname": "hello-mcp",
  "full_url": "https://example.default-domain/hello-mcp",
  "version": 3,
  "source_code_length": 714002,
  "source_code_sha256": "...",
  "config_keys": ["cssFileLinks", "inlineStyles"],
  "asset_counts": {
    "css": 1,
    "js": 1,
    "inline_styles": 1,
    "inline_scripts": 1
  }
}
```

Use `get_page_content` or `get_page(include_content=true)` only when the full
HTML/config is needed.

`draft_version`, `live_version`, `draft_title`, and `live_title` are returned
separately when the API provides them. `publicly_accessible` is `null` when the
platform does not report it; clients must not infer public access from a draft
version alone.

### Upload result

`upload_asset` and `upload_asset_from_path` return only safe metadata:

```json
{
  "asset_id": "asset-id",
  "public_url": "https://static.otimififi.com/.../image.png",
  "mime_type": "image/png",
  "file_type": "image/png",
  "filename": "image.png",
  "size": 2048,
  "sha256": "..."
}
```

The temporary B2 upload URL, authorization token, and raw `prepare` or
`confirm` responses are never returned to the model.

### Error result

Errors use stable fields so a client can decide whether to retry:

```json
{
  "error": "storage upload failed",
  "error_code": "UPLOAD_TRANSFER_FAILED",
  "stage": "storage_upload",
  "retryable": false,
  "status": 400,
  "details": {
    "upstream_status": 400
  }
}
```

Known upload stages are `asset_read`, `media_prepare`, `storage_upload`, and
`media_confirm`. Error details are summarized and sensitive upstream bodies are
not copied into the response.

### HTML import report

`upsert_page_html` returns a compact page result and a report:

```json
{
  "page": {
    "id": "page-id",
    "source_code_length": 1200,
    "source_code_sha256": "..."
  },
  "import_report": {
    "preflight": {
      "extracted": [],
      "sanitized": [],
      "removed": [],
      "allowed_url_schemes": ["http", "https", "mailto", "tel", "relative", "anchor"],
      "rejected_url_schemes": ["data", "javascript", "vbscript", "file"]
    },
    "backend": {}
  }
}
```

The backend report reflects the API parser. The `stripped` field in older API
responses is preserved under `backend` for compatibility; it can include
extracted assets as well as removed content.

## Draft Preview

Use `get_draft_preview_url` for a short-lived signed preview URL:

```json
{
  "page_id": "page-id",
  "draft_version": 0,
  "preview_url": "https://example.default-domain/__preview__/page-id?version=0&preview_token=...",
  "access": "signed_preview",
  "expires_in_seconds": 600
}
```

This is distinct from a public URL. Call `publish_page` before reporting a
public page URL as live.
