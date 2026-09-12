# Codex CLI Setup

This guide installs both layers of the Otimififi integration:

- The **Skill** provides the website-building workflow and API guidance.
- The **MCP server** provides executable tools such as `create_website`,
  `upload_asset`, and `publish_page`.

The MCP server can work without the Skill, and the Skill can describe REST
calls without MCP. For Codex, installing both gives the best experience.

## Prerequisites

- Codex CLI is installed and available as `codex`.
- Node.js 18 or newer is installed; `npm` must be on `PATH`.
- You have an Otimififi access token.
- The token is kept in the shell environment and is never committed.

Create an access token from the Otimififi user settings or the access-token
endpoint described in [the API map](api-map.md).

## Install the Skill

Use the skill name from the `SKILL.md` frontmatter: `otimififi-site`. The
directory is also named `otimififi-site`.

```bash
npx skills add \
  https://github.com/Otimififi/agent-skills/tree/main/skills/otimififi-site \
  --skill otimififi-site \
  --agent codex \
  --global \
  --yes
```

Verify the installation:

```bash
npx skills ls --global --agent codex
```

The old `skills/site` path and `--skill site` name are no longer valid.

For a project-only installation, run the same command from the project root
and omit `--global`. The skill will be placed in the project's shared
`.agents/skills` directory.

## Configure Authentication

Export the token before starting Codex. The MCP process inherits it through
`env_vars` in the configuration below:

```bash
export OTIMIFIFI_ACCESS_TOKEN="your-access-token"
```

Do not put the token in a repository, page HTML, public asset, or shell script
checked into source control.

## Configure MCP

Codex stores global MCP configuration in `~/.codex/config.toml`. Add this
entry:

```toml
[mcp_servers.otimififi-site]
command = "npm"
args = [
  "exec",
  "--yes",
  "--package=git+https://github.com/Otimififi/agent-skills.git",
  "--",
  "otimififi-mcp-site",
]
env = { OTIMIFIFI_API_BASE = "https://api.otimififi.com" }
env_vars = ["OTIMIFIFI_ACCESS_TOKEN"]
startup_timeout_sec = 30
tool_timeout_sec = 120
```

`env_vars` tells Codex to forward the token from the environment without
writing the token into `config.toml`. Start Codex from the same shell where the
token was exported.

For a trusted project-only setup, place the same table in
`.codex/config.toml` at the project root instead. Keep the token in the
environment; the project config can be committed without the secret.

This is a local stdio server. Do not configure `https://api.otimififi.com` as
the MCP `url`; that is the REST API base, not an MCP streamable-HTTP endpoint.

## CLI Alternative

Codex can write the configuration for you:

```bash
codex mcp add otimififi-site \
  --env OTIMIFIFI_API_BASE=https://api.otimififi.com \
  --env OTIMIFIFI_ACCESS_TOKEN=YOUR_ACCESS_TOKEN \
  -- npm exec --yes \
  --package=git+https://github.com/Otimififi/agent-skills.git \
  -- otimififi-mcp-site
```

The CLI form stores values supplied with `--env` in Codex configuration. Use
the manual `config.toml` method above when you do not want the access token
stored there.

## Verify the Connection

Check that Codex has the server:

```bash
codex mcp list
codex mcp get otimififi-site
```

Start a new Codex session and use `/mcp` to view the connected tools. Then ask
Codex to run this safe read-only check:

```text
Call auth_status, then list_websites. Do not create, update, upload,
or publish anything.
```

The expected first tool is `auth_status`. A successful response confirms that
the token and API base are available to the MCP process.

## Available Tools

The server exposes:

- `auth_status`: validate the token and return the current profile.
- `list_websites`, `get_website`, `create_website`, `update_website`.
- `list_pages`, `get_page`, `create_page`, `update_page_meta`.
- `get_page_content`, `get_page_by_pathname`, `get_or_create_page`.
- `plan_static_page_import`, `apply_static_page_import` (publish is opt-in).
- `upsert_page_html`: write a draft using `body` or `full_html` mode.
- `get_draft_preview_url`: create a short-lived signed draft preview.
- `upload_asset`: upload CSS, JavaScript, images, or fonts.
- `upload_asset_from_path`: upload an allowed local workspace file.
- `set_page_assets`, `set_website_assets`: attach head assets.
- `publish_page`: commit a draft and optionally set it live.
- `get_public_urls`: return the site and page URLs.
- `mcp_health`: report configuration, auth, and registered tools.

Use the normal workflow: discover first, write a draft, inspect it, and publish
only when explicitly requested. See [the publish flow](publish-flow.md).

## Troubleshooting

### `No matching skills found`

Use `otimififi-site`, not `site`:

```bash
--skill otimififi-site
```

Use the current directory URL:

```text
https://github.com/Otimififi/agent-skills/tree/main/skills/otimififi-site
```

### `PromptScript does not support global skill installation`

The installer auto-detected another agent. Add the explicit flag:

```bash
--agent codex --global
```

### MCP server is missing from `codex mcp list`

- Confirm the entry is in `~/.codex/config.toml`.
- Restart Codex after changing configuration.
- Confirm `npm --version` works in the shell that starts Codex.
- Use the HTTPS GitHub package URL, not an SSH URL that requires GitHub SSH credentials.

### `OTIMIFIFI_ACCESS_TOKEN is required`

Export the token before starting Codex and confirm the config contains:

```toml
env_vars = ["OTIMIFIFI_ACCESS_TOKEN"]
```

Do not replace `env_vars` with a literal token in committed configuration.

### HTTP 401 or API errors

Run `auth_status` first. Check that the token is current and that
`OTIMIFIFI_API_BASE` is exactly `https://api.otimififi.com` without a trailing
path.

## Remove

Remove the MCP configuration with:

```bash
codex mcp remove otimififi-site
```

Remove the global Skill with:

```bash
npx skills remove otimififi-site --global --agent codex --yes
```
