import type { StructuralQueryPack } from "../query-pack.js";

export const VUE_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["sfc"]), family: "vue",
  querySources: Object.freeze([`
    ((element (start_tag (tag_name) @edge.type_ref)) (#match? @edge.type_ref "^[A-Z]"))
    ((self_closing_tag (tag_name) @edge.type_ref) (#match? @edge.type_ref "^[A-Z]"))
  `]),
});

export const MARKDOWN_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["commonmark-gfm"]), family: "markdown",
  querySources: Object.freeze([`[(atx_heading) (setext_heading)] @symbol.heading`]),
});

export const JSON_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["json"]), family: "json",
  querySources: Object.freeze([`(pair) @symbol.key`]),
});

export const YAML_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["yaml"]), family: "yaml",
  querySources: Object.freeze([`[(block_mapping_pair) (flow_pair)] @symbol.key`]),
});

export const DATA_DOCUMENT_QUERY_PACKS = Object.freeze([
  VUE_QUERY_PACK, MARKDOWN_QUERY_PACK, JSON_QUERY_PACK, YAML_QUERY_PACK,
]);
