import path from "path";
import { configDir } from "./xdg";

/** Registered scheduler job kinds exposed on the config surface. The row ids
 *  (`scheduled-*`) stay an implementation detail; the kind is the contract
 *  shared by handler registration and the env var names. */
export const SCHEDULER_JOB_KINDS = [
  "memory-consolidation",
  "decay-sweep",
  "auto-improve",
  "observation-bridge",
  "checkpoint-purge",
] as const;

export interface SchedulerJobConfig {
  enabled?: boolean;
  /** Interval between runs. Cron is deliberately not exposed here — see spec
   *  Out of Scope. */
  intervalMs?: number;
}

export interface SchedulerConfig {
  enabled?: boolean;
  tickMs?: number;
  maxConcurrent?: number;
  jobs?: Partial<Record<(typeof SCHEDULER_JOB_KINDS)[number], SchedulerJobConfig>>;
}

export interface MassaAiConfig {
  database?: {
    // Optional DATABASE_URL home (secret). Seeded into process.env at runtime
    // by env.ts when DATABASE_URL is unset, so config.json is the source of
    // truth for the DB connection unless an explicit env override exists.
    url: string;
  };
  embedding: {
    provider: "ollama" | "mistral" | "openai" | "google" | "cohere";
    model: string;
    baseURL?: string;
    apiKey?: string;
    dimensions?: number;
  };
  compression: {
    // Runtime canonical shape — mirrors ServerConfig.compression. The loader
    // consumes `targetCompressionRatio` + `minTokensForCompression` +
    // `defaultStrategy`. `prompt` is an optional compression-specific override
    // (env `MASSA_AI_LLM_PROMPT`); the LLM connection fields live in the top-level
    // `llm` block.
    defaultStrategy: string;
    minTokensForCompression: number;
    targetCompressionRatio: number; // 0-1
    prompt?: string;
  };
  // Wave 5 FR-05 / N3: impact-analysis CTE behind-flag (default false).
  impact?: {
    bfsCteEnabled: boolean;
  };
  // Wave 5 FR-11 / N13: capture policy (bounded pure module). When absent,
  // the default policy (migrated from DEFAULT_IGNORES) is used. Loaded +
  // validated at config load (denyUnknownFields, maxIgnorePatterns,
  // maxMatchWork). The `.gitignore` merge runs BEFORE applyPolicy per
  // AD-W5-015.
  capturePolicy?: {
    rules: Array<{ pattern: string; disposition: "Keep" | "Drop" | "MetadataOnly" }>;
    maxMatchWork?: number;
    maxIgnorePatterns?: number;
  };
  cache: {
    enabled: boolean;
    l1MaxSizeMB: number;
    l2MaxSizeMB: number;
    defaultTTLSeconds: number;
  };
  dataDir: string;
  logging: {
    level: "debug" | "info" | "warn" | "error";
    enableMetrics: boolean;
    /**
     * Optional absolute path to append log lines to. Empty or absent means
     * "use the default path" (`<dataDir>/logs/massa-ai.log`) — it must NOT be
     * read as "disable the sink" (LOG-02 / pre-mortem #1). Overridden by
     * MASSA_AI_LOG_FILE (env > config, matching the `level` precedence).
     * Disabling the sink is the explicit `enableFileSink: false` below, the
     * ONLY way to do so.
     */
    file?: string;
    /** The ONLY way to disable the file sink (LOG-02 AC 2b). Default `true`. */
    enableFileSink?: boolean;
    /** In-process ring-buffer capacity (LOG-01). Default 2000. */
    bufferSize?: number;
    /** Rotate the sink once it exceeds this size in MB (LOG-07). Default 32. */
    maxFileSizeMb?: number;
    /** Rotated files retained alongside the live file (LOG-07). Default 5. */
    maxFiles?: number;
  };
  // Keys below mirror the runtime ServerConfig declarations (index.ts) so the
  // interface describes what the loader/runtime actually produces. See
  // ServerConfig for the authoritative field documentation.
  search: {
    autoReindexMaxFiles: number;
    queryUnderstanding: {
      enabled: boolean;
      hydeEnabled: boolean;
      cacheTtlMs: number;
      cacheMaxSize: number;
    };
    rerank: {
      enabled: boolean;
      rerankWindow: number;
    };
  };
  llm: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    codeModel: string;
    temperature: number;
    maxOutputTokens: number;
    timeoutMs: number;
    disableThink: boolean;
  };
  memory: {
    decay: {
      lambda: number;
      sigma: number;
      mu: number;
      coldThreshold: number;
    };
    bootstrap: {
      enabled: boolean;
      maxSeedMemories: number;
      centralityLimit: number;
      gitLogLimit: number;
      refreshEnabled: boolean;
    };
    autoImprove: {
      enabled: boolean;
      reviewGate: boolean;
      minObservations: number;
      minIntervalMs: number;
      maxWindow: number;
      minQueryHits: number;
      minFileHits: number;
      minFixHits: number;
    };
    autoImportance: {
      enabled: boolean;
    };
  };
  hooks: {
    enabled: boolean;
    maxPayloadBytes: number;
    queue: {
      maxPending: number;
    };
    bridge: {
      enabled: boolean;
      minObservations: number;
      minIntervalMs: number;
      maxWindow: number;
    };
  };
  synapse: SynapseConfig;
  // Cross-session handoffs (Phase 6). begin/accept/cancel have no LLM dep; the
  // optional summary-polish inherits the top-level `llm.enabled` gate. Mirrors the
  // runtime ServerConfig declaration (config/index.ts).
  handoffs: {
    enabled: boolean;
  };
  // Tools API access control. `apiKey` is the runtime auth secret: it is
  // auto-provisioned into this file on first start when neither the
  // MASSA_AI_API_KEY env var nor a stored value is present, so an existing
  // install keeps working without an operator edit. Storing it here rather
  // than in a second secret file follows the `llm.apiKey` / `embedding.apiKey`
  // precedent and inherits the documented env > config.json > default chain.
  security?: {
    apiKey?: string;
    // Exact browser origins allowed to call the API. Empty (the default) means
    // no cross-origin request is permitted at all — the previous behavior
    // reflected any Origin back with credentials enabled.
    corsOrigins?: string[];
    // Dot-prefixed file extensions the indexer and search scanners consider.
    // Omit to use DEFAULT_ALLOWED_EXTENSIONS; an empty array is rejected at
    // load time because it would silently index nothing.
    allowedExtensions?: string[];
  };
  // REVERSED 2026-08-09 (user, feature `admin-portal-ops-suite`, AD-020): this
  // key previously read "`scheduler` is intentionally NOT a config key — it is
  // env-driven (MASSA_AI_SCHEDULER_ENABLED + job-stale/reaper env vars). Do not
  // add it." The env-only surface is unreachable for a packaged install (no
  // supported way to turn periodic jobs on without setting process env vars),
  // so `scheduler` is now a first-class `config.json` section, resolved
  // `env > config.json > literal default` in `config/index.ts` (SCH-01..03,
  // SCH-06) exactly like every other section — this comment records the
  // reversal rather than silently deleting the prior decision.
  scheduler?: SchedulerConfig;
}

/**
 * Synapse — cognitive modulation layer over retrieval.
 * Every submodule has its own kill switch; the whole layer can be disabled at the top.
 * Mirrors the runtime SynapseRuntimeConfig (index.ts) shape; that declaration is
 * the single source of truth — keep the two in sync.
 */
export interface SynapseConfig {
  enabled: boolean;
  inhibition: {
    diversityPenalty: {
      enabled: boolean;
      threshold: number; // cosine threshold above which results are considered redundant
      lambda: number;    // penalty strength: score *= (1 - lambda * cosine)
      samePathPenalty?: number;
    };
    temporalInhibition: {
      enabled: boolean;
      penaltyAgeMs: number; // memories younger than this get penalized when query is non-temporal
      penalty: number;      // absolute score reduction
    };
    confidenceGate: {
      enabled: boolean;
      thresholds: { specific: number; focused: number; broad: number };
    };
    chainInhibition: {
      enabled: boolean;
      boosts?: Record<string, Record<string, number>>;
    };
  };
  scoring: {
    attention: {
      enabled: boolean;
      rerankWindow: number;
      recencyHalfLifeMs: number;
      semanticScale: number;
      weights: {
        semantic: number;
        recency: number;
        accessHeat: number;
        taskAlign: number;
        agentAffinity: number;
        confidence: number;
      };
    };
  };
  metacognition: {
    enabled: boolean;
    lowConfidenceThreshold: number;
    definitiveTopScore: number;
    definitiveGap: number;
  };
  buffer: {
    enabled: boolean;
    maxSize: number;
    ttlMs: number;
    hitBoost: number;
    matchThreshold: number;
  };
}

/** Maximum files to scan before refusing (FR-11 `MAX_MATCH_WORK`). */
export const MAX_MATCH_WORK = 100_000;
/** Maximum number of Drop patterns allowed (FR-11 `MAX_IGNORE_PATTERNS`). */
export const MAX_IGNORE_PATTERNS = 1_024;

/**
 * The capture policy in force when `config.json` names none — the single
 * source for what used to be declared twice: here and as `DEFAULT_POLICY` in
 * `packages/core/src/services/search/capture-policy.ts`, which now re-exports
 * this (`core` depends on `shared`, never the reverse).
 *
 * It is a REAL default, not `undefined`. Leaving it absent made
 * `GET /api/v1/config` return 14 of the Admin Portal's 16 sections, so the
 * Capture Policy tab rendered "not configured" while these 30 rules were the
 * ones actually dropping files from every index.
 *
 * Content-identical to the previous core-side literal, which is what keeps
 * this a disclosure rather than a behavior change: `getActivePolicy()` used to
 * fall through to that literal and now receives this one.
 */
export const DEFAULT_CAPTURE_POLICY: NonNullable<MassaAiConfig["capturePolicy"]> = {
  rules: [
    { pattern: "**/node_modules/**", disposition: "Drop" },
    { pattern: "**/.git/**", disposition: "Drop" },
    { pattern: "**/dist/**", disposition: "Drop" },
    { pattern: "**/build/**", disposition: "Drop" },
    { pattern: "**/coverage/**", disposition: "Drop" },
    { pattern: ".env", disposition: "Drop" },
    { pattern: ".env.*", disposition: "Drop" },
    { pattern: "**/generated/**", disposition: "Drop" },
    { pattern: "**/*.generated.*", disposition: "Drop" },
    { pattern: "**/*.d.ts", disposition: "Drop" },
    { pattern: "**/__tests__/**", disposition: "Drop" },
    { pattern: "**/tests/**", disposition: "Drop" },
    { pattern: "**/*.test.ts", disposition: "Drop" },
    { pattern: "**/*.test.tsx", disposition: "Drop" },
    { pattern: "**/*.test.js", disposition: "Drop" },
    { pattern: "**/*.test.jsx", disposition: "Drop" },
    { pattern: "**/*.spec.ts", disposition: "Drop" },
    { pattern: "**/*.spec.tsx", disposition: "Drop" },
    { pattern: "**/*.spec.js", disposition: "Drop" },
    { pattern: "**/*.spec.jsx", disposition: "Drop" },
    { pattern: "**/benchmarks/**", disposition: "Drop" },
    { pattern: "**/fixtures/**", disposition: "Drop" },
    { pattern: "**/*.wasm*", disposition: "Drop" },
    { pattern: "**/*.min.*", disposition: "Drop" },
    { pattern: "**/*.map", disposition: "Drop" },
    { pattern: "**/lock.yaml", disposition: "Drop" },
    { pattern: "**/pnpm-lock.yaml", disposition: "Drop" },
    { pattern: "**/package-lock.json", disposition: "Drop" },
    { pattern: "**/bun.lockb", disposition: "Drop" },
    { pattern: "**/yarn.lock", disposition: "Drop" },
  ],
  maxMatchWork: MAX_MATCH_WORK,
  maxIgnorePatterns: MAX_IGNORE_PATTERNS,
};

/**
 * Scheduler defaults mirroring the literal fallbacks `config/index.ts`
 * resolves as `env > config.json > literal` (SCH-01..03). The mirror is the
 * point: this block is what `loadConfig()` — and therefore the Admin Portal —
 * shows for an install whose `config.json` predates the section, so it has to
 * report what is genuinely running rather than an aspiration.
 *
 * `enabled: false` is deliberate even though the installer now writes `true`
 * on a fresh install. Flipping the literal would start five background jobs
 * on every existing install and every CI run at upgrade time; the installer's
 * prompt is where a user opts in.
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  enabled: false,
  tickMs: 60_000,
  maxConcurrent: 2,
  jobs: {
    "memory-consolidation": { enabled: false, intervalMs: 30 * 60 * 1000 },
    "decay-sweep": { enabled: false, intervalMs: 60 * 60 * 1000 },
    "auto-improve": { enabled: false, intervalMs: 30 * 60 * 1000 },
    "observation-bridge": { enabled: false, intervalMs: 30 * 60 * 1000 },
    "checkpoint-purge": { enabled: false, intervalMs: 60 * 60 * 1000 },
  },
};

export const defaultMassaAiConfig: MassaAiConfig = {
  database: {
    url: "",
  },
  // Aligned with the literal defaults in core's services/embeddings/config.ts
  // (the ollama entry). loadConfig merges this block under a user config.json,
  // and core consumes the merged block as the env > config.json > default
  // middle layer — so an absent user block must resolve to the same values the
  // env-only path defaults to, or the merge itself would change behavior.
  embedding: {
    provider: "ollama",
    model: "qwen3-embedding:4b",
    baseURL: "http://localhost:11434",
    dimensions: 2560,
  },
  compression: {
    defaultStrategy: "code_structure",
    minTokensForCompression: 100,
    targetCompressionRatio: 0.7,
  },
  // Wave 5 FR-05: impact-analysis CTE behind-flag (default false).
  impact: {
    bfsCteEnabled: false,
  },
  // Wave 5 FR-11: the default capture policy is surfaced rather than left
  // `undefined`. Same 30 Drop rules `getActivePolicy()` already fell back to,
  // now visible in `GET /api/v1/config` and the Admin Portal's Capture Policy
  // tab. A `config.json` block still replaces it wholesale (rule lists merge
  // by replacement, never by append — see `loadConfig`).
  capturePolicy: DEFAULT_CAPTURE_POLICY,
  cache: {
    enabled: true,
    l1MaxSizeMB: 100,
    l2MaxSizeMB: 500,
    defaultTTLSeconds: 3600,
  },
  dataDir: path.join(configDir("massa-ai"), "data"),
  logging: {
    level: "info",
    enableMetrics: false,
  },
  search: {
    autoReindexMaxFiles: 200,
    queryUnderstanding: {
      enabled: false,
      hydeEnabled: true,
      cacheTtlMs: 300_000,
      cacheMaxSize: 256,
    },
    rerank: {
      enabled: false,
      rerankWindow: 50,
    },
  },
  llm: {
    enabled: false,
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    model: "qwen2.5:7b-instruct",
    codeModel: "qwen2.5-coder:7b",
    temperature: 0.2,
    maxOutputTokens: 8000,
    timeoutMs: 90_000,
    disableThink: true,
  },
  memory: {
    decay: {
      lambda: 0.02,
      sigma: 0.6,
      mu: 0.04,
      coldThreshold: 0.2,
    },
    bootstrap: {
      enabled: true,
      maxSeedMemories: 8,
      centralityLimit: 10,
      gitLogLimit: 20,
      refreshEnabled: true,
    },
    autoImprove: {
      enabled: true,
      reviewGate: false,
      minObservations: 8,
      minIntervalMs: 300_000,
      maxWindow: 16,
      minQueryHits: 3,
      minFileHits: 3,
      minFixHits: 2,
    },
    autoImportance: {
      enabled: false,
    },
  },
  hooks: {
    enabled: true,
    maxPayloadBytes: 65_536,
    queue: {
      maxPending: 256,
    },
    bridge: {
      enabled: true,
      minObservations: 8,
      minIntervalMs: 300_000,
      maxWindow: 8,
    },
  },
  synapse: {
    enabled: true,
    inhibition: {
      diversityPenalty: { enabled: true, threshold: 0.85, lambda: 0.4, samePathPenalty: 0.15 },
      temporalInhibition: { enabled: true, penaltyAgeMs: 3_600_000, penalty: 0.15 },
      confidenceGate: {
        enabled: true,
        thresholds: { specific: 0.55, focused: 0.4, broad: 0.25 },
      },
      chainInhibition: { enabled: true },
    },
    scoring: {
      attention: {
        enabled: false,
        rerankWindow: 50,
        recencyHalfLifeMs: 7 * 24 * 60 * 60 * 1000,
        semanticScale: 1.0,
        weights: {
          semantic: 0.25,
          recency: 0.15,
          accessHeat: 0.15,
          taskAlign: 0.2,
          agentAffinity: 0.1,
          confidence: 0.15,
        },
      },
    },
    metacognition: {
      enabled: true,
      lowConfidenceThreshold: 0.15,
      definitiveTopScore: 0.8,
      definitiveGap: 0.2,
    },
    buffer: {
      enabled: true,
      maxSize: 20,
      ttlMs: 900_000,
      hitBoost: 1.3,
      matchThreshold: 0.4,
    },
  },
  handoffs: {
    enabled: true,
  },
  // No apiKey by default — it is generated and persisted on first start.
  // Empty corsOrigins means no cross-origin request is permitted.
  security: {
    corsOrigins: [],
  },
  // Present, not absent: an install whose config.json predates the section
  // otherwise showed the Admin Portal's Scheduler tab with no fields at all.
  // These are the same literals `config/index.ts` resolves against.
  scheduler: DEFAULT_SCHEDULER_CONFIG,
};
