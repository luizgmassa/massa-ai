/**
 * Provider-neutral reachability + model-listing probe. Discriminates by
 * response body shape, never by HTTP status: LM Studio answers 200 with
 * `{"error": "..."}` for every unknown endpoint, so `response.ok` carries no
 * information (measured, spec.md § "The measured finding that shapes the
 * design"). Any tier may import `kernel/`; this module imports no tier.
 */

import type {
  InferenceProviderId,
  InferenceProviderSpec,
} from "@massa-ai/shared/inference-providers";

export type ProbeFailureReason = "unreachable" | "non-json" | "wrong-shape";

export type ProbeResult =
  | { reachable: true; models: string[] }
  | { reachable: false; reason: ProbeFailureReason };

const LIST_MODELS_PATH: Readonly<Record<InferenceProviderId, string>> = {
  ollama: "/api/tags",
  lmstudio: "/v1/models",
};

export async function probeProvider(
  spec: InferenceProviderSpec,
  baseUrl: string,
  timeoutMs = 3000,
): Promise<ProbeResult> {
  const url = new URL(LIST_MODELS_PATH[spec.id], baseUrl).toString();

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { reachable: false, reason: "unreachable" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { reachable: false, reason: "non-json" };
  }

  const models = spec.parseModelList(body);
  if (models === null) {
    return { reachable: false, reason: "wrong-shape" };
  }

  return { reachable: true, models };
}
