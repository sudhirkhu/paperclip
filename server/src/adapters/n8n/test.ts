import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "../types.js";
import { asString, parseObject } from "../utils.js";

function summarizeStatus(
  checks: AdapterEnvironmentCheck[],
): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const webhookUrl = asString(config.webhookUrl, "");
  const baseUrl = asString(config.baseUrl, "").replace(/\/$/, "");
  const workflowId = asString(config.workflowId, "");
  const apiToken = asString(config.apiToken, "");

  const done = (): AdapterEnvironmentTestResult => ({
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  });

  // Webhook mode: a single absolute URL is sufficient.
  if (webhookUrl) {
    try {
      const url = new URL(webhookUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        checks.push({
          code: "n8n_webhook_protocol_invalid",
          level: "error",
          message: `Unsupported webhook protocol: ${url.protocol}`,
          hint: "Use an http:// or https:// webhook URL.",
        });
      } else {
        checks.push({
          code: "n8n_webhook_configured",
          level: "info",
          message: `Webhook endpoint: ${url.toString()}`,
        });
      }
    } catch {
      checks.push({
        code: "n8n_webhook_invalid",
        level: "error",
        message: `Invalid webhook URL: ${webhookUrl}`,
      });
    }
    return done();
  }

  // API mode: needs baseUrl + workflowId + apiToken.
  if (!baseUrl) {
    checks.push({
      code: "n8n_base_url_missing",
      level: "error",
      message: "N8N adapter requires baseUrl (or a webhookUrl).",
      hint: "Set adapterConfig.baseUrl to your N8N instance origin, e.g. https://n8n.example.com.",
    });
    return done();
  }

  let url: URL | null = null;
  try {
    url = new URL(baseUrl);
  } catch {
    checks.push({
      code: "n8n_base_url_invalid",
      level: "error",
      message: `Invalid baseUrl: ${baseUrl}`,
    });
  }

  if (!workflowId) {
    checks.push({
      code: "n8n_workflow_id_missing",
      level: "error",
      message: "N8N adapter requires workflowId in API mode.",
      hint: "Set adapterConfig.workflowId to the workflow to execute.",
    });
  }

  if (!apiToken) {
    checks.push({
      code: "n8n_api_token_missing",
      level: "warn",
      message: "No apiToken set — the N8N public API will reject requests.",
      hint: "Set adapterConfig.apiToken to an N8N API key.",
    });
  }

  // Live reachability probe against the public API.
  if (url && (url.protocol === "http:" || url.protocol === "https:")) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const probe = await fetch(`${baseUrl}/api/v1/workflows?limit=1`, {
        method: "GET",
        headers: apiToken ? { "X-N8N-API-KEY": apiToken } : {},
        signal: controller.signal,
      });
      if (probe.ok) {
        checks.push({
          code: "n8n_api_probe_ok",
          level: "info",
          message: "N8N public API responded to a workflows probe.",
        });
      } else if (probe.status === 401 || probe.status === 403) {
        checks.push({
          code: "n8n_api_probe_unauthorized",
          level: "error",
          message: `N8N API rejected the key (HTTP ${probe.status}).`,
          hint: "Check the apiToken and that the key has API access.",
        });
      } else {
        checks.push({
          code: "n8n_api_probe_unexpected_status",
          level: "warn",
          message: `N8N API probe returned HTTP ${probe.status}.`,
        });
      }
    } catch (err) {
      checks.push({
        code: "n8n_api_probe_failed",
        level: "warn",
        message: err instanceof Error ? err.message : "N8N API probe failed",
        hint: "Verify the N8N instance is reachable from the Paperclip server host.",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return done();
}
