# HTML import modes

## `body` (default)

- `html` is stored as `source_code` (page body inside site chrome).
- Head assets must be set via `config` / `set_page_assets` / website head assets.
- Tornado template markers `{{` / `{%` in body are escaped on `full_html` only; for body mode avoid them or escape manually.

## `full_html`

Server parses the document:

| Source | Destination |
|--------|-------------|
| `<body>…</body>` | `source_code` |
| `<title>` | draft `title` if not provided |
| `<link rel=stylesheet href>` | `config.cssFileLinks` |
| `<script src>` | `config.jsFileLinks` (position head vs body_end) |
| `<style>` | `config.inlineStyles` |
| inline `<script>` | `config.inlineScripts` |

Stripped / ignored: `iframe`, `object`, `embed`, event handlers (`onclick`, …), unsafe URL schemes.

Response may include `import.stripped` notes.

## Craft.js note

Writing only `source_code` does not update visual editor `react_nodes`. AI code path is source_code–first; re-opening in visual designer may not match until nodes are regenerated.
