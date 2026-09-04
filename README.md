# Otimififi Agent Tools

Private GitHub distribution for the Otimififi site-building Agent Skill and
MCP server.

The repository deliberately keeps the two layers together:

- `skills/site` teaches an Agent how to use Otimififi site tools.
- `mcp-site` provides the actual MCP tools and starts over stdio.

## Install the Skill

For private repository testing:

```bash
npx skills add git@github.com:otimififi/agent-skills.git --skill site -g -y
```

When this repository becomes public, the shorter form is:

```bash
npx skills add otimififi/agent-skills@site -g -y
```

## Run the MCP server

The package manager installs dependencies automatically from this GitHub
repository:

```bash
npm exec --yes \
  --package=git+ssh://git@github.com/otimififi/agent-skills.git \
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

## Claude Code configuration

```bash
claude mcp add --scope user otimififi-site -- \
  npm exec --yes \
  --package=git+ssh://git@github.com/otimififi/agent-skills.git \
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

This repository is private during the validation period. Keep the repository
private until the MCP tools, authentication flow, and publishing behavior have
been tested. Make it public only when the user-facing GitHub install commands
are ready.
