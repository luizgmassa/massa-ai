/**
 * The Config tab's declarative field schema — one row per section, one entry
 * per field: input type, coercion on save, and Field guide text. Split out of
 * `config.js` so the section table has its own module boundary; `config.js`
 * imports it and re-exports `CONFIG_SECTIONS` for compatibility.
 */

export const CONFIG_SECTIONS = [
  {
    key: "database",
    label: "Database",
    fields: [{ name: "url", type: "text", label: "Database URL", sensitive: true, guide: "PostgreSQL connection string (e.g., `postgresql://user:pass@host:5432/db`). Changing this requires a server restart." }],
  },
  {
    key: "embedding",
    label: "Embedding",
    fields: [
      { name: "provider", type: "enum", label: "Provider", enum: ["ollama", "mistral", "openai", "google", "cohere"], guide: "Which embedding provider to use. Ollama runs locally; others are cloud APIs." },
      { name: "model", type: "text", label: "Model", guide: "The embedding model name (e.g., `qwen3-embedding:4b` for Ollama)." },
      { name: "baseURL", type: "text", label: "Base URL", guide: "Base URL for the embedding API. For Ollama, typically `http://localhost:11434`." },
      { name: "apiKey", type: "text", label: "API Key", sensitive: true, guide: "API key for cloud providers. Not needed for Ollama. Changing this requires a restart." },
      { name: "dimensions", type: "number", label: "Dimensions", guide: "Embedding vector dimension. Must match the model's output dimension (e.g., 2560 for `qwen3-embedding:4b`)." },
    ],
  },
  {
    key: "compression",
    label: "Compression",
    fields: [
      { name: "defaultStrategy", type: "text", label: "Default Strategy", guide: "Compression strategy: code_structure, conversation_summary, semantic_dedup, or hierarchical." },
      { name: "minTokensForCompression", type: "number", label: "Min Tokens", guide: "Minimum token count to trigger compression. Below this, content is kept verbatim." },
      { name: "targetCompressionRatio", type: "number", label: "Target Ratio (0-1)", guide: "Target compression ratio (0.7 = reduce to 70% of original)." },
      { name: "prompt", type: "text", label: "Prompt (optional)", guide: "Custom LLM prompt for compression. When empty, uses the built-in default." },
    ],
  },
  {
    key: "impact",
    label: "Impact Analysis",
    fields: [{ name: "bfsCteEnabled", type: "boolean", label: "BFS CTE Enabled", guide: "When checked, impact analysis uses a PostgreSQL recursive CTE for BFS traversal. Faster on large graphs but requires PostgreSQL 17+." }],
  },
  {
    key: "capturePolicy",
    label: "Capture Policy",
    fields: [
      { name: "maxMatchWork", type: "number", label: "Max Match Work", guide: "Maximum glob match operations before bailing. Default: 100000." },
      { name: "maxIgnorePatterns", type: "number", label: "Max Ignore Patterns", guide: "Maximum ignore patterns allowed. Default: 1024." },
      // `json`, not `string[]`: these are objects, and `string[]` renders by
      // joining, so thirty rules displayed as thirty "[object Object]" — and
      // saving that split the placeholder text back on commas, submitting
      // thirty junk strings for a field whose validator demands objects.
      { name: "rules", type: "json", label: "Rules (JSON)", guide: "Capture rules as JSON array of {pattern, disposition: Keep|Drop|MetadataOnly}. When absent, the built-in `DEFAULT_POLICY` applies." },
    ],
  },
  {
    key: "cache",
    label: "Cache",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables the two-level cache (L1 in-memory, L2 disk)." },
      { name: "l1MaxSizeMB", type: "number", label: "L1 Max Size (MB)", guide: "Maximum L1 (in-memory) cache size in megabytes." },
      { name: "l2MaxSizeMB", type: "number", label: "L2 Max Size (MB)", guide: "Maximum L2 (disk) cache size in megabytes." },
      { name: "defaultTTLSeconds", type: "number", label: "Default TTL (s)", guide: "Default time-to-live for cache entries in seconds." },
    ],
  },
  {
    key: "dataDir",
    label: "Data Directory",
    fields: [{ name: "dataDir", type: "text", label: "Data Directory", guide: "Base directory for massa-ai data files (checkpoints, exports, etc.)." }],
  },
  {
    key: "logging",
    label: "Logging",
    fields: [
      { name: "level", type: "enum", label: "Level", enum: ["debug", "info", "warn", "error"], guide: "Log verbosity level. debug is most verbose; error is least." },
      { name: "enableMetrics", type: "boolean", label: "Enable Metrics", guide: "When checked, emits structured metrics events for monitoring." },
      { name: "file", type: "text", label: "Log File (optional)", guide: "Path to a log file. When empty, logs go to stdout only." },
    ],
  },
  {
    key: "search",
    label: "Search",
    fields: [
      { name: "autoReindexMaxFiles", type: "number", label: "Auto Reindex Max Files", guide: "Maximum file count to auto-reindex without prompting. Above this, manual reindex is required." },
      { name: "queryUnderstanding.enabled", type: "boolean", label: "Query Understanding Enabled", guide: "When checked, rewrites user queries using LLM for better retrieval." },
      { name: "queryUnderstanding.hydeEnabled", type: "boolean", label: "HyDE Enabled", guide: "When checked, generates hypothetical document embeddings (HyDE) to improve query matching." },
      { name: "queryUnderstanding.cacheTtlMs", type: "number", label: "QU Cache TTL (ms)", guide: "Time-to-live for query understanding cache entries in milliseconds." },
      { name: "queryUnderstanding.cacheMaxSize", type: "number", label: "QU Cache Max Size", guide: "Maximum number of cached query understanding results." },
      { name: "rerank.enabled", type: "boolean", label: "Rerank Enabled", guide: "When checked, applies a reranker to search results for improved relevance." },
      { name: "rerank.rerankWindow", type: "number", label: "Rerank Window", guide: "Number of top results to consider for reranking." },
    ],
  },
  {
    key: "llm",
    label: "LLM",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables LLM-powered features (consolidation, query understanding, compression)." },
      { name: "baseUrl", type: "text", label: "Base URL", guide: "Base URL for the LLM API (e.g., `http://localhost:11434/v1` for Ollama OpenAI-compatible endpoint)." },
      { name: "apiKey", type: "text", label: "API Key", sensitive: true, guide: "API key for the LLM provider. Not needed for local Ollama. Changing this requires a restart." },
      { name: "model", type: "text", label: "Model", guide: "Primary LLM model name (e.g., `qwen2.5:7b-instruct`)." },
      { name: "codeModel", type: "text", label: "Code Model", guide: "Model used for code-related tasks. When empty, falls back to the primary model." },
      { name: "temperature", type: "number", label: "Temperature", guide: "Sampling temperature (0 = deterministic, 1 = creative). Typically 0.2 for tasks." },
      { name: "maxOutputTokens", type: "number", label: "Max Output Tokens", guide: "Maximum tokens the LLM can generate in a single response." },
      { name: "timeoutMs", type: "number", label: "Timeout (ms)", guide: "Request timeout in milliseconds. Increase for slow models." },
      { name: "disableThink", type: "boolean", label: "Disable Think", guide: "When checked, disables thinking/reasoning mode in models that support it (faster, cheaper)." },
    ],
  },
  {
    key: "memory",
    label: "Memory",
    fields: [
      { name: "decay.lambda", type: "number", label: "Decay Lambda", guide: "Exponential decay rate for memory importance over time." },
      { name: "decay.sigma", type: "number", label: "Decay Sigma", guide: "Decay bandwidth — controls how quickly memories lose relevance." },
      { name: "decay.mu", type: "number", label: "Decay Mu", guide: "Decay midpoint — the time at which importance is halved." },
      { name: "decay.coldThreshold", type: "number", label: "Decay Cold Threshold", guide: "Importance score below which a memory is considered 'cold' and eligible for consolidation." },
      { name: "bootstrap.enabled", type: "boolean", label: "Bootstrap Enabled", guide: "When checked, seeds initial memories from the repo on first use." },
      { name: "bootstrap.maxSeedMemories", type: "number", label: "Bootstrap Max Seeds", guide: "Maximum number of memories to seed during bootstrap." },
      { name: "bootstrap.centralityLimit", type: "number", label: "Bootstrap Centrality Limit", guide: "Number of top central files to include in bootstrap." },
      { name: "bootstrap.gitLogLimit", type: "number", label: "Bootstrap Git Log Limit", guide: "Number of recent git commits to analyze during bootstrap." },
      { name: "bootstrap.refreshEnabled", type: "boolean", label: "Bootstrap Refresh", guide: "When checked, periodically re-runs bootstrap to capture new repo changes." },
      { name: "autoImprove.enabled", type: "boolean", label: "Auto Improve Enabled", guide: "When checked, the auto-improvement loop detects patterns and proposes memory optimizations." },
      { name: "autoImprove.reviewGate", type: "boolean", label: "Auto Improve Review Gate", guide: "When checked, auto-improvement proposals require human review before applying. When unchecked, eligible proposals auto-apply." },
      { name: "autoImprove.minObservations", type: "number", label: "Auto Improve Min Observations", guide: "Minimum observations required before a pattern is proposed." },
      { name: "autoImprove.minIntervalMs", type: "number", label: "Auto Improve Min Interval (ms)", guide: "Minimum time between auto-improvement runs in milliseconds." },
      { name: "autoImprove.maxWindow", type: "number", label: "Auto Improve Max Window", guide: "Maximum number of recent observations to consider per run." },
      { name: "autoImprove.minQueryHits", type: "number", label: "Auto Improve Min Query Hits", guide: "Minimum repeated query hits to trigger a pattern proposal." },
      { name: "autoImprove.minFileHits", type: "number", label: "Auto Improve Min File Hits", guide: "Minimum repeated file access hits to trigger a proposal." },
      { name: "autoImprove.minFixHits", type: "number", label: "Auto Improve Min Fix Hits", guide: "Minimum repeated fix patterns to trigger a proposal." },
      { name: "autoImportance.enabled", type: "boolean", label: "Auto Importance Enabled", guide: "When checked, automatically scores memory importance based on access patterns." },
    ],
  },
  {
    key: "hooks",
    label: "Hooks",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables passive lifecycle hook capture (session start/end, tool use events)." },
      { name: "maxPayloadBytes", type: "number", label: "Max Payload Bytes", guide: "Maximum payload size for hook events. Larger payloads are truncated." },
      { name: "queue.maxPending", type: "number", label: "Queue Max Pending", guide: "Maximum pending hook events in the processing queue." },
      { name: "bridge.enabled", type: "boolean", label: "Bridge Enabled", guide: "When checked, bridges captured observations into durable memories via consolidation." },
      { name: "bridge.minObservations", type: "number", label: "Bridge Min Observations", guide: "Minimum observations required before a bridge consolidation runs." },
      { name: "bridge.minIntervalMs", type: "number", label: "Bridge Min Interval (ms)", guide: "Minimum time between bridge consolidation runs in milliseconds." },
      { name: "bridge.maxWindow", type: "number", label: "Bridge Max Window", guide: "Maximum number of observations to consider per bridge run." },
    ],
  },
  {
    key: "synapse",
    label: "Synapse",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables the Synapse cognitive modulation layer (task alignment, working memory, inhibition)." },
      { name: "inhibition.diversityPenalty.enabled", type: "boolean", label: "Diversity Penalty", guide: "When checked, penalizes search results that are too similar to already-seen items." },
      { name: "inhibition.diversityPenalty.threshold", type: "number", label: "DP Threshold", guide: "Similarity threshold above which the diversity penalty applies." },
      { name: "inhibition.diversityPenalty.lambda", type: "number", label: "DP Lambda", guide: "Strength of the diversity penalty." },
      { name: "inhibition.temporalInhibition.enabled", type: "boolean", label: "Temporal Inhibition", guide: "When checked, suppresses recently-seen items from appearing again too soon." },
      { name: "inhibition.temporalInhibition.penaltyAgeMs", type: "number", label: "TI Penalty Age (ms)", guide: "Time window in milliseconds during which a recently-seen item is penalized." },
      { name: "inhibition.temporalInhibition.penalty", type: "number", label: "TI Penalty", guide: "Penalty score applied to recently-seen items." },
      { name: "inhibition.confidenceGate.enabled", type: "boolean", label: "Confidence Gate", guide: "When checked, filters search results by confidence thresholds." },
      { name: "inhibition.confidenceGate.thresholds.specific", type: "number", label: "CG Specific", guide: "Confidence threshold for specific (high-relevance) results." },
      { name: "inhibition.confidenceGate.thresholds.focused", type: "number", label: "CG Focused", guide: "Confidence threshold for focused (medium-relevance) results." },
      { name: "inhibition.confidenceGate.thresholds.broad", type: "number", label: "CG Broad", guide: "Confidence threshold for broad (low-relevance) results." },
      { name: "scoring.attention.enabled", type: "boolean", label: "Attention Scoring", guide: "When checked, applies attention-based scoring (recency, semantic, task alignment) to search results." },
      { name: "scoring.attention.rerankWindow", type: "number", label: "Attention Rerank Window", guide: "Number of top results to rerank using attention scoring." },
      { name: "scoring.attention.recencyHalfLifeMs", type: "number", label: "Recency Half Life (ms)", guide: "Half-life for recency decay in attention scoring." },
      { name: "scoring.attention.semanticScale", type: "number", label: "Semantic Scale", guide: "Scaling factor for the semantic similarity component in attention scoring." },
      { name: "metacognition.enabled", type: "boolean", label: "Metacognition", guide: "When checked, enables metacognitive monitoring (confidence assessment of search results)." },
      { name: "metacognition.lowConfidenceThreshold", type: "number", label: "Low Confidence Threshold", guide: "Score below which a result is flagged as low-confidence." },
      { name: "metacognition.definitiveTopScore", type: "number", label: "Definitive Top Score", guide: "Score above which a result is considered definitively relevant." },
      { name: "metacognition.definitiveGap", type: "number", label: "Definitive Gap", guide: "Minimum gap between top and second result to declare a definitive match." },
      { name: "buffer.enabled", type: "boolean", label: "Buffer Enabled", guide: "When checked, enables the working-memory buffer for cross-search continuity." },
      { name: "buffer.maxSize", type: "number", label: "Buffer Max Size", guide: "Maximum number of entries in the working-memory buffer." },
      { name: "buffer.ttlMs", type: "number", label: "Buffer TTL (ms)", guide: "Time-to-live for working-memory buffer entries in milliseconds." },
      { name: "buffer.hitBoost", type: "number", label: "Buffer Hit Boost", guide: "Score boost applied to results that hit the working-memory buffer." },
      { name: "buffer.matchThreshold", type: "number", label: "Buffer Match Threshold", guide: "Similarity threshold for a buffer hit." },
    ],
  },
  {
    key: "handoffs",
    label: "Handoffs",
    fields: [{ name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables cross-session handoffs (structured summaries left for a later agent to discover)." }],
  },
  {
    key: "security",
    label: "Security",
    fields: [
      { name: "apiKey", type: "text", label: "API Key", sensitive: true, guide: "API key required on every request except `/health`, `/swagger`, and `/ui`. Auto-provisioned on first start. Changing this requires a restart." },
      { name: "corsOrigins", type: "string[]", label: "CORS Origins", guide: "Comma-separated list of allowed CORS origins. Empty means no CORS." },
      { name: "allowedExtensions", type: "string[]", label: "Allowed Extensions", guide: "Comma-separated list of file extensions allowed for indexing." },
    ],
  },
  {
    // SCH-08. Job kinds mirror packages/shared/src/config/massa-ai-config.ts's
    // SCHEDULER_JOB_KINDS; app.js is plain browser JS with no build-time
    // import of @massa-ai/shared, so the five kinds are listed literally here.
    key: "scheduler",
    label: "Scheduler",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables the background job scheduler (memory-consolidation, decay-sweep, auto-improve, observation-bridge, checkpoint-purge)." },
      { name: "tickMs", type: "number", label: "Tick Interval (ms)", guide: "How often the scheduler checks whether a job is due to run, in milliseconds. Minimum `1000`." },
      { name: "maxConcurrent", type: "number", label: "Max Concurrent Jobs", guide: "Maximum number of scheduled jobs allowed to run at the same time. Minimum `1`." },
      { name: "jobs.memory-consolidation.enabled", type: "boolean", label: "Memory Consolidation Enabled", guide: "When checked, the memory-consolidation job runs on its own schedule." },
      { name: "jobs.memory-consolidation.intervalMs", type: "number", label: "Memory Consolidation Interval (ms)", guide: "Interval between memory-consolidation runs, in milliseconds. Minimum `60000`." },
      { name: "jobs.decay-sweep.enabled", type: "boolean", label: "Decay Sweep Enabled", guide: "When checked, the decay-sweep job runs on its own schedule." },
      { name: "jobs.decay-sweep.intervalMs", type: "number", label: "Decay Sweep Interval (ms)", guide: "Interval between decay-sweep runs, in milliseconds. Minimum `60000`." },
      { name: "jobs.auto-improve.enabled", type: "boolean", label: "Auto Improve Enabled", guide: "When checked, the auto-improve job runs on its own schedule." },
      { name: "jobs.auto-improve.intervalMs", type: "number", label: "Auto Improve Interval (ms)", guide: "Interval between auto-improve runs, in milliseconds. Minimum `60000`." },
      { name: "jobs.observation-bridge.enabled", type: "boolean", label: "Observation Bridge Enabled", guide: "When checked, the observation-bridge job runs on its own schedule." },
      { name: "jobs.observation-bridge.intervalMs", type: "number", label: "Observation Bridge Interval (ms)", guide: "Interval between observation-bridge runs, in milliseconds. Minimum `60000`." },
      { name: "jobs.checkpoint-purge.enabled", type: "boolean", label: "Checkpoint Purge Enabled", guide: "When checked, the checkpoint-purge job runs on its own schedule." },
      { name: "jobs.checkpoint-purge.intervalMs", type: "number", label: "Checkpoint Purge Interval (ms)", guide: "Interval between checkpoint-purge runs, in milliseconds. Minimum `60000`." },
    ],
  },
];
