import type {
  StructuralBuildMetadata, StructuralLanguageResolver, StructuralReference,
  StructuralResolverDefinition, StructuralResolverFile,
} from "../resolver.js";
import { TYPESCRIPT_LANGUAGE_RESOLVER } from "./typescript.js";

export const MANAGED_LANGUAGE_RESOLVER: StructuralLanguageResolver = Object.freeze({
  ...TYPESCRIPT_LANGUAGE_RESOLVER,
  dialects: Object.freeze(["java", "kotlin", "kotlin-script", "scala", "csharp", "swift", "dart"]),
  resolve(file: StructuralResolverFile, reference: StructuralReference, definitions: readonly StructuralResolverDefinition[], build: StructuralBuildMetadata) {
    const unresolved = reference.target.status === "unresolved" ? reference.target : undefined;
    const resolverFile = unresolved ? { ...file, imports: file.imports.map((imported) => {
      if (file.dialect === "java" && imported.form === "java_static_import") {
        const owner = imported.specifier.split("/").at(-1)!;
        return { ...imported, bindings: imported.bindings.map((binding) => {
          if (binding.imported === "*" && binding.local === "*") {
            return { ...binding, imported: `${owner}.${unresolved.name}`, local: unresolved.name };
          }
          return { ...binding, imported: `${owner}.${binding.imported}` };
        }) };
      }
      if (file.dialect === "java" && imported.form === "java_import" && !imported.bindings.some((binding) => binding.imported === "*")) {
        const parts = imported.specifier.split("/");
        const known = new Set(build.knownFiles);
        for (let length = parts.length; length > 0; length -= 1) {
          const ownerSpecifier = parts.slice(0, length).join("/");
          if (!known.has(`${ownerSpecifier}.java`)) continue;
          const owner = parts[length - 1]!;
          const nested = parts.slice(length);
          return { ...imported, specifier: ownerSpecifier, bindings: imported.bindings.map((binding) => ({
            ...binding, imported: [owner, ...nested].join("."),
          })) };
        }
      }
      const exposesWildcard = imported.bindings.some((binding) => binding.imported === "*" && binding.local === "*");
      const hidden = imported.bindings.some((binding) => binding.imported === `!${unresolved.name}`);
      if (!exposesWildcard || unresolved.qualifier || hidden || imported.form !== "dart_import") return imported;
      return { ...imported, bindings: imported.bindings.map((binding) =>
        binding.imported === "*" && binding.local === "*"
          ? { ...binding, imported: unresolved.name, local: unresolved.name }
          : binding
      ) };
    }) } : file;
    return TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      resolverFile, reference, definitions.filter((item) =>
        file.dialect === "kotlin" || file.dialect === "kotlin-script"
          ? item.identity.dialect === "kotlin" || item.identity.dialect === "kotlin-script"
          : item.identity.dialect === file.dialect
      ), build,
    );
  },
});
