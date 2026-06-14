import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asString, asNumber, parseObject } from "../utils.js";

// N8N backend adapter. Lets a Paperclip agent's run be executed by an N8N
// workflow instead of a CLI agent — making N8N a peer execution backend
// alongside claude_local et al. Two trigger modes:
//   • webhook  — POST to a workflow's webhook URL (config.webhookUrl).
//   • api      — POST {baseUrl}/api/v1/workflows/{workflowId}/execute with
//                the X-N8N-API-KEY header (mirrors Nucleus's n8n client).
// The webhook's / execution's JSON response becomes the run output.

function buildBody(ctx: AdapterExecutionContext): Record<string, unknown> {
  const { config, runId, agent, context } = ctx;
  const payloadTemplate = parseObject(config.payloadTemplate);
  return {
    ...payloadTemplate,
    agentId: agent.id,
    runId,
    context,
  };
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { config } = ctx;

  const webhookUrl = asString(config.webhookUrl, "");
  const baseUrl = asString(config.baseUrl, "").replace(/\/$/, "");
  const workflowId = asString(config.workflowId, "");
  const apiToken = asString(config.apiToken, "");

  let target: string;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (webhookUrl) {
    target = webhookUrl;
  } else {
    if (!baseUrl) throw new Error("N8N adapter missing baseUrl (or webhookUrl)");
    if (!workflowId) throw new Error("N8N adapter missing workflowId");
    target = `${baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/execute`;
    if (apiToken) headers["X-N8N-API-KEY"] = apiToken;
  }

  const timeoutMs = asNumber(config.timeoutMs, 0);
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify(buildBody(ctx)),
      ...(timer ? { signal: controller.signal } : {}),
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `N8N workflow invoke failed with status ${res.status}`,
        errorCode: res.status === 401 || res.status === 403 ? "unauthorized" : null,
        resultJson:
          parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : { body: parsed },
      };
    }

    const summary =
      typeof parsed === "string"
        ? parsed.slice(0, 280)
        : `N8N workflow ${workflowId || "(webhook)"} completed`;

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary,
      provider: "n8n",
      resultJson:
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : { output: parsed },
    };
  } catch (err) {
    if (timer && err instanceof Error && err.name === "AbortError") {
      return {
        exitCode: null,
        signal: null,
        timedOut: true,
        errorMessage: `N8N workflow timed out after ${timeoutMs}ms`,
        errorCode: "timeout",
      };
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
