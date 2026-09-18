# Salesforce query agent (Cursor)

Ask Cursor for BMC Knowledge Articles and Cases in plain English; the agent
builds the SOQL and runs it through the Salesforce DX MCP server.

This is Cursor developer tooling only. It does not touch the AMIGO in-app
Upgrade Advisor (`/api/chat`), and no Salesforce credentials live in this repo.

## Prerequisites

1. **Node.js** on `PATH` (the MCP server is launched with `npx`).
2. **Salesforce CLI** installed — `sf --version`.
3. **Org authorized under the alias `bmc`:**

   ```bash
   sf org login web --alias bmc
   sf org display --target-org bmc
   ```

   Confirm data access:

   ```bash
   sf data query --target-org bmc --query "SELECT Id FROM Knowledge__kav WHERE PublishStatus = 'Online' LIMIT 1"
   ```

## Enable the MCP server

Config is committed at [`.cursor/mcp.json`](../.cursor/mcp.json), pinned to org
alias `bmc` with only the read-only `run_soql_query` tool:

```json
{
  "mcpServers": {
    "salesforce-bmc": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@salesforce/mcp@latest", "--orgs", "bmc", "--toolsets", "data", "--tools", "run_soql_query"]
    }
  }
}
```

1. Make sure the file exists **in the folder you have open in Cursor** (see
   troubleshooting below — this is the most common problem).
2. Restart Cursor. Project MCP config is read at startup.
3. Open **Customize → MCPs**. `salesforce-bmc` should be listed and enabled.

First launch downloads `@salesforce/mcp`, which takes up to a minute.

## Use it

Ask the agent directly, for example:

- find Control-M knowledge articles with "New Day" in the title
- look up KA 000354649
- recent open cases mentioning Control-M

Query conventions (default filters, KA number format, field lists, LIMIT rules)
live in the skill at
[`.cursor/skills/salesforce-bmc/SKILL.md`](../.cursor/skills/salesforce-bmc/SKILL.md).

## Troubleshooting

### `salesforce-bmc` is missing from Customize → MCPs

Cursor lists MCP servers from config files **on your local disk**, so a missing
entry almost always means the file isn't where Cursor is looking.

1. **Is the file on your current branch?** `.cursor/mcp.json` arrived on a
   feature branch. If your checkout is on `main` and the branch is not merged,
   the file is not on disk:

   ```bash
   git branch --show-current
   ls .cursor/mcp.json
   ```

   Fix by merging the pull request, or check the branch out locally:

   ```bash
   git fetch origin
   git checkout cursor/salesforce-query-agent-9b01
   ```

2. **Restart Cursor.** Adding or editing project MCP config requires a restart.

3. **Is the repo root the folder you opened?** Project config must sit at
   `<opened folder>/.cursor/mcp.json`. If you opened a parent folder or a
   multi-root `.code-workspace`, Cursor may not treat it as project config —
   use **File → Open Folder** on the repo root.

4. **Is the JSON valid?** A trailing comma or comment makes Cursor skip the
   whole file. Validate it:

   ```bash
   node -e "JSON.parse(require('fs').readFileSync('.cursor/mcp.json','utf8')); console.log('ok')"
   ```

5. **Check the toggle and scope filter** in Customize → MCPs — a disabled server
   won't load, and the user/workspace/team filter can hide it.

### Prefer it always available, on any branch

Copy the same `mcpServers` block into your personal global config, which is
branch-independent:

- Windows: `%USERPROFILE%\.cursor\mcp.json`
- macOS / Linux: `~/.cursor/mcp.json`

Project config wins when a server name appears in both.

### Server is listed but fails to start

- **Windows `npx` spawn errors.** If the server errors immediately, Node's shim
  isn't resolving. Use the shell wrapper in your config instead:

  ```json
  {
    "mcpServers": {
      "salesforce-bmc": {
        "type": "stdio",
        "command": "cmd",
        "args": ["/c", "npx", "-y", "@salesforce/mcp@latest", "--orgs", "bmc", "--toolsets", "data", "--tools", "run_soql_query"]
      }
    }
  }
  ```

  `"command": "npx.cmd"` or the full path to `npx.cmd` also works.

- **Read the logs.** Output panel → **MCP Logs** shows the server's startup
  output and the reason it exited.

### Queries fail with an auth error

The session for alias `bmc` expired or was never created:

```bash
sf org login web --alias bmc
```

### Queries fail with an invalid-field error

BMC custom fields (`..._c`) vary by org. Drop the unknown field and retry with
standard fields only; the agent is instructed never to invent API names.
