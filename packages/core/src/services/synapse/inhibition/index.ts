export {
  applyDiversityPenalty,
  type DiversityPenaltyConfig,
} from "./diversity-penalty.js";

export {
  applyConfidenceGate,
  prefilterByRawScore,
  classifyQuery,
  type ConfidenceGateConfig,
} from "./confidence-gate.js";

export {
  applyTemporalInhibition,
  hasTemporalIndicator,
  type TemporalInhibitionConfig,
} from "./temporal-inhibition.js";

export {
  applyChainInhibition,
  detectIntent,
  DEFAULT_CHAIN_BOOSTS,
  type ChainInhibitionConfig,
} from "./chain-inhibition.js";
