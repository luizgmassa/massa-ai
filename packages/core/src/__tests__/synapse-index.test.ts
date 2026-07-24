/**
 * Tests for the synapse barrel (services/synapse/index.ts).
 *
 * Covers the lazy singleton getSynapseManager()/resetSynapseManager() and
 * verifies the re-exports are reachable.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  getSynapseManager,
  resetSynapseManager,
  SynapseManager,
  TaskEnvelopeService,
  SessionRegistry,
  getSessionRegistry,
  resetSessionRegistry,
  WorkingMemoryBuffer,
  DEFAULT_BUFFER_CONFIG,
  applyAttentionScore,
  DEFAULT_ATTENTION_CONFIG,
  computeTaskAlignment,
  computeAgentAffinity,
} from "../services/synapse/index.js";
import type {
  AgentSession,
  QueryIntent,
  SpectrumFlags,
  SynapsePipelineResult,
} from "../services/synapse/index.js";

describe("synapse/index — getSynapseManager singleton", () => {
  beforeEach(() => {
    resetSynapseManager();
  });

  test("returns a SynapseManager instance", () => {
    const mgr = getSynapseManager();
    expect(mgr).toBeInstanceOf(SynapseManager);
  });

  test("returns a stable cached instance", () => {
    const a = getSynapseManager();
    const b = getSynapseManager();
    expect(a).toBe(b);
  });

  test("resetSynapseManager drops the cached instance", () => {
    const a = getSynapseManager();
    resetSynapseManager();
    const b = getSynapseManager();
    expect(a).not.toBe(b);
  });
});

describe("synapse/index — re-exports", () => {
  test("SynapseManager class is exported", () => {
    expect(typeof SynapseManager).toBe("function");
  });

  test("TaskEnvelopeService class is exported", () => {
    expect(typeof TaskEnvelopeService).toBe("function");
  });

  test("SessionRegistry + singleton accessors are exported", () => {
    expect(typeof SessionRegistry).toBe("function");
    expect(typeof getSessionRegistry).toBe("function");
    expect(typeof resetSessionRegistry).toBe("function");
  });

  test("WorkingMemoryBuffer + DEFAULT_BUFFER_CONFIG are exported", () => {
    expect(typeof WorkingMemoryBuffer).toBe("function");
    expect(DEFAULT_BUFFER_CONFIG).toBeDefined();
    expect(DEFAULT_BUFFER_CONFIG.maxSize).toBeGreaterThan(0);
  });

  test("attention-score exports are re-exported", () => {
    expect(typeof applyAttentionScore).toBe("function");
    expect(DEFAULT_ATTENTION_CONFIG).toBeDefined();
    expect(DEFAULT_ATTENTION_CONFIG.rerankWindow).toBeGreaterThan(0);
  });

  test("task-alignment + agent-affinity are re-exported", () => {
    expect(typeof computeTaskAlignment).toBe("function");
    expect(typeof computeAgentAffinity).toBe("function");
  });

  test("types are exported (compile-time check via values)", () => {
    // The type-only re-exports can't be runtime-checked, but we can confirm
    // the module loads without error and the runtime values exist.
    const intent: QueryIntent = "general";
    expect(intent).toBe("general");
    const flags: SpectrumFlags = {
      lowConfidence: false,
      noStrongMatch: false,
      definitiveMatch: false,
      spread: 0,
      mean: 0,
      confidence: 0,
    };
    expect(flags.confidence).toBe(0);
  });
});