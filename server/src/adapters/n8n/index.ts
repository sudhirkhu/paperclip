import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

// N8N as a first-class execution backend. An agent configured with
// adapterType "n8n" runs by triggering an N8N workflow instead of a CLI
// agent — so the Paperclip brain orchestrates both agents (claude_local
// et al.) and workflow automation (N8N) under one runtime model.
export const n8nAdapter: ServerAdapterModule = {
  type: "n8n",
  execute,
  testEnvironment,
  models: [],
  agentConfigurationDoc: `# n8n agent configuration

Adapter: n8n

Runs an agent by triggering an N8N workflow. Two modes:

Webhook mode (simplest):
- webhookUrl (string): absolute URL of the workflow's webhook trigger.

API mode (uses the N8N public REST API):
- baseUrl (string): N8N instance origin, e.g. https://n8n.example.com
- workflowId (string): id of the workflow to execute
- apiToken (string): N8N API key (sent as X-N8N-API-KEY)

Common:
- payloadTemplate (object, optional): JSON merged into the request body
  (alongside agentId, runId, context).
- timeoutMs (number, optional): request timeout in milliseconds.

The workflow's JSON response becomes the run output (resultJson + summary).
`,
};
