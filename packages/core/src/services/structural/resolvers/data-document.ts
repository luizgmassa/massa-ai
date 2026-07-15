import type { StructuralLanguageResolver } from "../resolver.js";
import { TYPESCRIPT_LANGUAGE_RESOLVER } from "./typescript.js";

/** Host resolver for document/data dialects; Vue embedded references use TS path semantics. */
export const DATA_DOCUMENT_LANGUAGE_RESOLVER: StructuralLanguageResolver = Object.freeze({
  ...TYPESCRIPT_LANGUAGE_RESOLVER,
  dialects: Object.freeze(["sfc", "commonmark-gfm", "json", "yaml"]),
});
