# Otimififi Agent Tools

Public GitHub distribution for the Otimififi site-building Agent Skill and
MCP server.

The repository deliberately keeps the two layers together:

- `skills/otimififi-site` teaches an Agent how to use Otimififi site tools.
- `mcp-site` provides the actual MCP tools and starts over stdio.

## Install the Skill

### OpenCode

```bash
npx skills add \
  https://github.com/Otimififi/agent-skills/tree/main/skills/otimififi-site \
  --skill otimififi-site --agent opencode --global --yes
```

### Codex CLI

```bash
npx skills add \
  https://github.com/Otimififi/agent-skills/tree/main/skills/otimififi-site \
  --skill otimififi-site --agent codex --global --yes
```

Always specify `--agent` for global installation. Without it, the installer
may select another detected agent that does not support global scope.

## Configure the MCP Server

The MCP server runs over stdio. Codex and other clients start it on demand;
you do not need to run a long-lived HTTP service.

The package manager installs dependencies automatically from this public GitHub
repository:

```bash
npm exec --yes \
  --package=git+https://github.com/Otimififi/agent-skills.git \
  -- otimififi-mcp-site
```

For a local checkout:

```bash
npm install
npm start
```

Configure the MCP process with:

```text
OTIMIFIFI_API_BASE=https://api.otimififi.com
OTIMIFIFI_ACCESS_TOKEN=<your access token>
```

Never commit the access token or put it in page HTML or public assets.

## Codex CLI Configuration

See the complete setup guide, including token handling, `config.toml`,
verification, removal, and troubleshooting:

[Codex CLI setup](skills/otimififi-site/references/codex-setup.md)

The short version is to add the MCP server to `~/.codex/config.toml` and export
`OTIMIFIFI_ACCESS_TOKEN` before starting Codex.

## Claude Code Configuration

```bash
claude mcp add --scope user otimififi-site -- \
  npm exec --yes \
  --package=git+https://github.com/Otimififi/agent-skills.git \
  -- otimififi-mcp-site
```

Pass the two environment variables using Claude Code's MCP environment
configuration or the equivalent client configuration. The server supports the
same tools whether it is started from a checkout or from the GitHub package.

## First prompt

```text
Use the otimififi-site skill. First call auth_status and list my existing
websites. Create a portfolio website as a draft and return the preview URL.
Do not publish it yet.
```

## Project status

This repository is public. Keep access tokens out of the repository, page HTML,
and public assets.
