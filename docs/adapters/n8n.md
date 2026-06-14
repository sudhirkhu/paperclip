---
title: N8N
summary: N8N workflow execution backend adapter
---

The `n8n` adapter runs an agent by triggering an [N8N](https://n8n.io)
workflow instead of a CLI agent. It makes N8N a first-class execution
backend alongside `claude_local` and the other agent runtimes, so the
Paperclip brain orchestrates both autonomous agents and workflow
automation under one runtime model.

## Trigger modes

**Webhook mode** (simplest) — point at a workflow's webhook trigger:

| Field | Type | Description |
|-------|------|-------------|
| `webhookUrl` | string | Absolute URL of the workflow's webhook node |

**API mode** — use the N8N public REST API:

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | string | N8N instance origin, e.g. `https://n8n.example.com` |
| `workflowId` | string | Id of the workflow to execute |
| `apiToken` | string | N8N API key (sent as `X-N8N-API-KEY`) |

**Common:**

| Field | Type | Description |
|-------|------|-------------|
| `payloadTemplate` | object | JSON merged into the request body (with `agentId`, `runId`, `context`) |
| `timeoutMs` | number | Request timeout in milliseconds (0 = none) |

## Behavior

- The request body is `{ ...payloadTemplate, agentId, runId, context }`.
- The workflow's JSON response becomes the run output: `resultJson` holds
  the parsed body, `summary` a short description.
- Non-2xx → `errorCode` `unauthorized` (401/403) or a generic failure;
  timeouts → `errorCode` `timeout`. The result is always an
  `AdapterExecutionResult`, never an unhandled throw on HTTP status.

## Environment test

The "Test Environment" action validates config and probes reachability —
in API mode it `GET`s `{baseUrl}/api/v1/workflows?limit=1` with the key
and reports `pass` / `warn` / `fail`.

## Notes

- Registered as a built-in adapter (`server/src/adapters/n8n/`), so it
  appears via `listServerAdapters()` and cannot be replaced by plugins.
- Pairs with the Nucleus-side N8N integration (spec 017): Nucleus agents
  can also call N8N workflows as tools, and N8N workflows can call Nucleus
  agents via the bridge. This adapter adds the third leg — an agent whose
  *runtime* is an N8N workflow.
