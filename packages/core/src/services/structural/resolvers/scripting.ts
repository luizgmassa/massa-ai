import type {
  StructuralBuildMetadata,
  StructuralLanguageResolver,
  StructuralReference,
  StructuralResolverDefinition,
  StructuralResolverFile,
} from "../resolver.js";
import { TYPESCRIPT_LANGUAGE_RESOLVER } from "./typescript.js";

/** Syntax-independent identity/import/global resolution for the scripting cohort. */
export const SCRIPTING_LANGUAGE_RESOLVER: StructuralLanguageResolver = Object.freeze({
  ...TYPESCRIPT_LANGUAGE_RESOLVER,
  dialects: Object.freeze(["python", "ruby", "php", "lua-luajit"]),
  resolve(
    file: StructuralResolverFile,
    reference: StructuralReference,
    definitions: readonly StructuralResolverDefinition[],
    build: StructuralBuildMetadata,
  ) {
    return TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file,
      reference,
      definitions.filter((definition) => definition.identity.dialect === file.dialect),
      build,
    );
  },
});
