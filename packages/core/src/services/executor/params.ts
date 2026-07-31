/**
 * Request shapes for the polyglot executor.
 *
 * PR-C, T8b. These three interfaces were declared in `tools/execute`,
 * `tools/execute_file` and `tools/batch_execute`, and `ExecutorController`
 * imported them from there — three of the five `controllers -> tools` edges that
 * T11 converts into `services -> tools` the moment it folds that controller into
 * this directory. **AC-3 is closed by removal, not by an allowlist entry** (C19),
 * so the request shapes live beside the service that fulfils them.
 *
 * The tool files re-export what they declared, which keeps `tools/index.ts` and
 * therefore the published root barrel byte-identical: `ExecuteParams` and its two
 * siblings are public API.
 */
import type { Language } from "./runtime.js";

export interface ExecuteParams {
  language: Language;
  code: string;
  timeout?: number;
  background?: boolean;
  cwd?: string;
  intent?: string;
}

export interface ExecuteFileParams {
  path: string;
  language: Language;
  code: string;
  timeout?: number;
  intent?: string;
}

export interface BatchExecuteParams {
  commands: string[];
  queries?: string[];
  timeout?: number;
  concurrency?: number;
  cwd?: string;
  query_scope?: string;
}
