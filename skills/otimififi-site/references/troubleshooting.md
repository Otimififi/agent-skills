# Troubleshooting

## MCP Is Not Registered

Run the diagnostic tool after starting the server:

```text
Call mcp_health and report the result without creating or publishing anything.
```

Check these fields:

- `registered_tools` contains the expected tool names.
- `api.configured` is `true`.
- `auth.token_configured` is `true`.
- `auth.valid` is `true`.

For Codex, also run `codex mcp list` and `codex mcp get otimififi-site`, then
restart Codex after changing `config.toml`.

## Authentication Errors

The MCP process requires both environment variables:

```bash
export OTIMIFIFI_API_BASE=https://api.otimififi.com
export OTIMIFIFI_ACCESS_TOKEN="your-access-token"
```

If the server reports `MISSING_ACCESS_TOKEN`, the process did not inherit the
token. For Codex, use `env_vars = ["OTIMIFIFI_ACCESS_TOKEN"]` and start Codex
from the shell where the variable is exported.

For HTTP 401, run `auth_status` first. Do not retry an expired or revoked token.

## Upload Failures

Upload errors include an `error_code`, `stage`, and `retryable` flag.

- `ASSET_PATH_NOT_ALLOWED` (`asset_read`): path is outside the configured
  roots. Set `OTIMIFIFI_ASSET_ROOTS` to the workspace directory.
- `ASSET_TOO_LARGE` (`asset_read`): file exceeds
  `OTIMIFIFI_MAX_ASSET_BYTES`. Reduce the file or raise the explicit limit.
- `UPLOAD_PREPARE_FAILED` (`media_prepare`): API rejected quota, MIME, or
  permission. Inspect the HTTP status and fix the request.
- `UPLOAD_TRANSFER_FAILED` (`storage_upload`): B2/storage rejected or dropped
  the upload. Retry only when `retryable` is true.
- `UPLOAD_CONFIRM_FAILED` (`media_confirm`): API could not record the
  completed upload. Check the asset ID before retrying.

`upload_asset_from_path` is preferred for binary files. It reads only absolute
paths inside `OTIMIFIFI_ASSET_ROOTS` (the current working directory by default)
and returns a SHA-256 hash for verification.

For an image, do not put the local path or a `data:` URL into the final page.
Upload it first, use `public_url` in `<img src>`, and retry the upload only when
the returned error is marked `retryable`.

## Draft Does Not Exist

Draft versions are zero or negative. Use `get_page_content` to inspect a page,
then call `upsert_page_html` with `create_draft_if_missing=true` (the default).
For a controlled preview, use `get_draft_preview_url`; do not expose a draft
version as a public URL.

## HTML Was Sanitized

`upsert_page_html` returns `import_report` with `extracted`, `sanitized`, and
`removed` entries. The parser allows `http`, `https`, `mailto`, `tel`, relative,
and anchor URLs. It rejects `data:`, `javascript:`, `vbscript:`, and `file:` URL
schemes in URL attributes, removes inline event handlers, and removes dangerous
body tags such as `iframe`, `object`, `embed`, `meta`, `base`, and `form`.

Inline `<style>` and `<script>` content is extracted into page config rather
than returned as body HTML. The backend's legacy `stripped` list may name these
extractions; use the structured preflight report for the clearer explanation.

## Duplicate Pathname

Use `get_page_by_pathname` before creating a page, or use
`get_or_create_page` for a lookup-and-create operation. The latter re-checks
after a create conflict to handle concurrent callers and returns the existing
page ID when possible.

## Large Page Responses

`list_pages` and `get_page` return summaries by default. Request full content
only when needed:

```text
Call get_page_content for page-id.
```

Use the returned length and hash to verify content without placing the full
HTML in the model context.

## Static Import Safety

Use `plan_static_page_import` before a large import. It reports pathname
conflicts, asset references, and HTML cleanup without mutating the website.
Then call `apply_static_page_import` with its default `publish=false`. Only set
`publish=true` after reviewing the plan and the draft preview.
