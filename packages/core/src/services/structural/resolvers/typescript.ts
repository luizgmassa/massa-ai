import path from "node:path";
import {
  StructuralFqnRegistry,
  normalizeStructuralFile,
  type StructuralFqnCandidate,
  type StructuralIdentity,
} from "../../../kernel/fqn-codec.js";
import type {
  ResolvableDefinition,
  StructuralBuildMetadata,
  StructuralLanguageResolver,
  StructuralPathAlias,
  StructuralReference,
  StructuralResolverDefinition,
  StructuralResolverFile,
  StructuralResolverOutcome,
  StructuralResolutionSource,
} from "../resolver.js";

export const TYPESCRIPT_RESOLVER_VERSION = "1.0.0";
const DIALECT_PROBES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  typescript: ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"],
  tsx: ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"],
  javascript: ["", ".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.jsx", "/index.ts", "/index.tsx"],
  jsx: ["", ".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.jsx", "/index.ts", "/index.tsx"],
  sfc: ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"],
  python: ["", ".py", "/__init__.py"], ruby: ["", ".rb"], php: ["", ".php"],
  "lua-luajit": ["", ".lua"],
  c: ["", ".c", ".h"], "header-default-c": ["", ".c", ".h"],
  cpp: ["", ".cpp", ".hpp", ".h"], header: ["", ".cpp", ".hpp", ".h"], "header-cpp": ["", ".cpp", ".hpp", ".h"],
  go: ["", ".go"], rust: ["", ".rs"], zig: ["", ".zig"],
  java: ["", ".java"], kotlin: ["", ".kt", ".kts"], "kotlin-script": ["", ".kt", ".kts"],
  scala: ["", ".scala"], csharp: ["", ".cs"], swift: ["", ".swift"], dart: ["", ".dart"],
  elixir: ["", ".ex", ".exs"], "elixir-script": ["", ".ex", ".exs"], erlang: ["", ".erl"],
  clojure: ["", ".clj"], ocaml: ["", ".ml"], haskell: ["", ".hs"],
});

function candidates(identities: readonly StructuralIdentity[]): readonly StructuralFqnCandidate[] {
  return Object.freeze(identities.map((identity) => Object.freeze({
    fqn: identity.fqn,
    file: identity.file,
    name: identity.name,
    displayName: identity.displayName,
    qualifiedName: identity.qualifiedName,
    kind: identity.kind,
    signatureHash: identity.signatureHash,
  })).sort((left, right) => {
    for (const [a, b] of [
      [left.file, right.file],
      [left.qualifiedName, right.qualifiedName],
      [left.kind, right.kind],
      [left.signatureHash, right.signatureHash],
      [left.fqn, right.fqn],
    ] as const) {
      if (a < b) return -1;
      if (a > b) return 1;
    }
    return 0;
  }));
}

interface NormalizedReference {
  kind: StructuralReference["kind"];
  span: StructuralReference["span"];
  name: string;
  qualifier?: string;
  lexicalScope?: string;
  existingFqn?: string;
}

function outcome(
  reference: NormalizedReference,
  matches: readonly ResolvableDefinition[],
  source: StructuralResolutionSource,
): StructuralResolverOutcome | undefined {
  const unique = [...new Map(matches.map((match) => [match.identity.fqn, match])).values()];
  if (unique.length === 0) return undefined;
  if (unique.length === 1) {
    const identity = unique[0]!.identity;
    return Object.freeze({ status: "resolved", fqn: identity.fqn, identity, source });
  }
  return Object.freeze({
    status: "ambiguous",
    name: reference.name,
    ...(reference.qualifier ? { qualifier: reference.qualifier } : {}),
    candidates: candidates(unique.map((match) => match.identity)),
  });
}

function normalizedReference(reference: StructuralReference): NormalizedReference {
  if (reference.target.status === "resolved") {
    return Object.freeze({
      kind: reference.kind,
      span: reference.span,
      existingFqn: reference.target.fqn,
      name: reference.target.fqn,
      ...(reference.lexicalScope ? { lexicalScope: reference.lexicalScope.normalize("NFC").trim() } : {}),
    });
  }
  const rawName = reference.target.name.normalize("NFC").trim();
  const name = rawName.startsWith("#") ? `%23${rawName.slice(1)}` : rawName;
  const qualifier = reference.target.qualifier?.normalize("NFC").trim();
  if (!name) throw new TypeError("reference name must not be empty");
  if (reference.target.qualifier !== undefined && !qualifier) throw new TypeError("reference qualifier must not be empty");
  const lexicalScope = reference.lexicalScope?.normalize("NFC").trim();
  return Object.freeze({
    kind: reference.kind,
    span: reference.span,
    name,
    ...(qualifier ? { qualifier } : {}),
    ...(lexicalScope ? { lexicalScope } : {}),
  });
}

function indexDefinitions(
  definitions: readonly StructuralResolverDefinition[],
): { registry: StructuralFqnRegistry; definitions: readonly ResolvableDefinition[] } {
  const registry = new StructuralFqnRegistry();
  const indexed = definitions.map((definition) => {
    const name = definition.identity.name.startsWith("#") ? `%23${definition.identity.name.slice(1)}` : definition.identity.name;
    const qualifiedName = definition.identity.qualifiedName.split(".").map((part) =>
      part.startsWith("#") ? `%23${part.slice(1)}` : part
    ).join(".");
    const identity = definition.resolvedIdentity ?? registry.register({ ...definition.identity, name, qualifiedName });
    return Object.freeze({
      identity,
      arity: definition.identity.arity,
      exported: definition.exported,
      defaultExport: definition.defaultExport === true,
    });
  });
  return { registry, definitions: Object.freeze(indexed) };
}

// ── Definition index (R1). The resolver session hands the SAME frozen
// definitions array to every edge, yet the resolve path used to re-run
// indexDefinitions + a cascade of full-array filters over all ~80k project
// definitions on EVERY edge — an O(edges × projectDefinitions) blow-up that
// cost a 5.5h resolve for 6210 files (~5B transient allocations), starved
// the machine's memory under GC pressure and stalled the embedding/DB
// stacks. The index below is built once per (definitions array, dialect
// scope) pair, WeakMap-keyed on the array identity, and each per-edge
// filter becomes a Map lookup. Buckets are built in source-array order so
// the first-match semantics of the previous `.filter`/`.find` chain and the
// `outcome()`/`candidates()` ordering are preserved exactly.

interface ResolvablePartition {
  list: readonly ResolvableDefinition[];
  byFqn: ReadonlyMap<string, ResolvableDefinition>;
  byFile: ReadonlyMap<string, readonly ResolvableDefinition[]>;
  byFileQualifiedName: ReadonlyMap<string, readonly ResolvableDefinition[]>;
  byQualifiedName: ReadonlyMap<string, readonly ResolvableDefinition[]>;
}

interface ScopedDefinitionIndex {
  registry: StructuralFqnRegistry;
  /** candidateKind(type_ref|extend|implement) partition. */
  typeRefs: ResolvablePartition;
  /** candidateKind(call|data_flow|http_call) partition. */
  calls: ResolvablePartition;
  /** The full scoped list (unpartitioned) — resolveLegacy materialization. */
  all: ResolvablePartition;
}

const TYPE_REF_KINDS = new Set(["class", "interface", "trait", "enum", "type", "type_parameter"]);
const CALL_KINDS = new Set(["function", "method", "constructor", "class", "field", "variable", "constant", "export"]);
const FAMILY_DIALECTS = new Set(["typescript", "tsx", "javascript", "jsx", "sfc"]);

const REFERENCE_PARTITION: Readonly<Partial<Record<StructuralReference["kind"], "typeRefs" | "calls">>> = Object.freeze({
  type_ref: "typeRefs",
  extend: "typeRefs",
  implement: "typeRefs",
  call: "calls",
  data_flow: "calls",
  http_call: "calls",
});

const EMPTY_PARTITION: ResolvablePartition = Object.freeze({
  list: Object.freeze([]),
  byFqn: new Map(),
  byFile: new Map(),
  byFileQualifiedName: new Map(),
  byQualifiedName: new Map(),
});

function buildPartition(list: readonly ResolvableDefinition[]): ResolvablePartition {
  const byFqn = new Map<string, ResolvableDefinition>();
  const byFile = new Map<string, ResolvableDefinition[]>();
  const byFileQualifiedName = new Map<string, ResolvableDefinition[]>();
  const byQualifiedName = new Map<string, ResolvableDefinition[]>();
  for (const definition of list) {
    const identity = definition.identity;
    if (!byFqn.has(identity.fqn)) byFqn.set(identity.fqn, definition);
    const fileBucket = byFile.get(identity.file);
    if (fileBucket) fileBucket.push(definition);
    else byFile.set(identity.file, [definition]);
    const fileQualifiedNameKey = `${identity.file}\0${identity.qualifiedName}`;
    const fileQualifiedNameBucket = byFileQualifiedName.get(fileQualifiedNameKey);
    if (fileQualifiedNameBucket) fileQualifiedNameBucket.push(definition);
    else byFileQualifiedName.set(fileQualifiedNameKey, [definition]);
    const qualifiedNameBucket = byQualifiedName.get(identity.qualifiedName);
    if (qualifiedNameBucket) qualifiedNameBucket.push(definition);
    else byQualifiedName.set(identity.qualifiedName, [definition]);
  }
  return { list, byFqn, byFile, byFileQualifiedName, byQualifiedName };
}

function buildScopedIndex(
  rawDefinitions: readonly StructuralResolverDefinition[],
  familyOnly: boolean,
): ScopedDefinitionIndex {
  const scoped = familyOnly
    ? rawDefinitions.filter((definition) => FAMILY_DIALECTS.has(definition.identity.dialect))
    : rawDefinitions;
  const { registry, definitions: all } = indexDefinitions(scoped);
  const typeRefs: ResolvableDefinition[] = [];
  const calls: ResolvableDefinition[] = [];
  for (const definition of all) {
    if (TYPE_REF_KINDS.has(definition.identity.kind)) typeRefs.push(definition);
    if (CALL_KINDS.has(definition.identity.kind)) calls.push(definition);
  }
  return { registry, typeRefs: buildPartition(typeRefs), calls: buildPartition(calls), all: buildPartition(all) };
}

const RESOLVE_INDEX_CACHE = new WeakMap<
  readonly StructuralResolverDefinition[],
  Map<boolean, ScopedDefinitionIndex>
>();

function definitionIndex(
  rawDefinitions: readonly StructuralResolverDefinition[],
  familyOnly: boolean,
): ScopedDefinitionIndex {
  let byScope = RESOLVE_INDEX_CACHE.get(rawDefinitions);
  if (!byScope) {
    byScope = new Map();
    RESOLVE_INDEX_CACHE.set(rawDefinitions, byScope);
  }
  const existing = byScope.get(familyOnly);
  if (existing) return existing;
  const built = buildScopedIndex(rawDefinitions, familyOnly);
  byScope.set(familyOnly, built);
  return built;
}

/**
 * Cache a dialect-scoped view of the raw definitions array. The delegating
 * resolvers (managed/scripting/systems/functional) used to `filter` the full
 * project definitions on every edge, producing a fresh array that defeated
 * the resolve index memoization; scoping through here keeps one stable
 * scoped array per (definitions, dialectKey) pair instead.
 */
const DIALECT_SCOPE_CACHE = new WeakMap<
  readonly StructuralResolverDefinition[],
  Map<string, readonly StructuralResolverDefinition[]>
>();

export function cachedDialectScope(
  definitions: readonly StructuralResolverDefinition[],
  dialectKey: string,
  predicate: (definition: StructuralResolverDefinition) => boolean,
): readonly StructuralResolverDefinition[] {
  let byKey = DIALECT_SCOPE_CACHE.get(definitions);
  if (!byKey) {
    byKey = new Map();
    DIALECT_SCOPE_CACHE.set(definitions, byKey);
  }
  const existing = byKey.get(dialectKey);
  if (existing) return existing;
  const scoped = definitions.filter((definition) => predicate(definition));
  byKey.set(dialectKey, scoped);
  return scoped;
}

/**
 * Memoize the normalized known-files Set built from a build.knownFiles
 * array. Callers used to rebuild it (NFC-normalizing every entry) per import
 * specifier — ~62k Set constructions per index run.
 */
const KNOWN_FILES_CACHE = new WeakMap<readonly string[], ReadonlySet<string>>();

export function normalizedKnownFiles(knownFiles: readonly string[]): ReadonlySet<string> {
  const existing = KNOWN_FILES_CACHE.get(knownFiles);
  if (existing) return existing;
  const built = new Set(knownFiles.map(normalizeStructuralFile));
  KNOWN_FILES_CACHE.set(knownFiles, built);
  return built;
}

function probe(base: string, known: ReadonlySet<string>, dialect = "typescript"): string | undefined {
  const bases = /\.[cm]?jsx?$/u.test(base)
    ? [base.replace(/\.[cm]?jsx?$/u, ".ts"), base.replace(/\.[cm]?jsx?$/u, ".tsx"), base]
    : [base];
  for (const candidateBase of bases) for (const suffix of DIALECT_PROBES[dialect] ?? [""]) {
    const value = path.posix.normalize(`${candidateBase}${suffix}`);
    if (!value.startsWith("../") && value !== ".." && known.has(value)) return value;
  }
  return undefined;
}

export function resolveStructuralSpecifier(
  specifier: string,
  fromFile: string,
  build: StructuralBuildMetadata,
  dialect = "typescript",
): string | undefined {
  const known = normalizedKnownFiles(build.knownFiles);
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return probe(path.posix.join(path.posix.dirname(fromFile), specifier), known, dialect);
  }
  const aliases = build.pathAliasesByFile?.[normalizeStructuralFile(fromFile)] ?? build.pathAliases ?? [];
  for (const alias of aliases) {
    const star = alias.pattern.indexOf("*");
    let capture: string | undefined;
    if (star < 0) {
      if (specifier !== alias.pattern) continue;
      capture = "";
    } else {
      const prefix = alias.pattern.slice(0, star);
      const suffix = alias.pattern.slice(star + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
      capture = specifier.slice(prefix.length, specifier.length - suffix.length);
    }
    for (const target of alias.targets) {
      const resolved = probe(target.replace("*", capture), known, dialect);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

export function matchesStructuralPathAlias(
  specifier: string,
  aliases: readonly StructuralPathAlias[],
): boolean {
  return aliases.some((alias) => {
    const star = alias.pattern.indexOf("*");
    if (star < 0) return specifier === alias.pattern;
    const prefix = alias.pattern.slice(0, star);
    const suffix = alias.pattern.slice(star + 1);
    return specifier.startsWith(prefix) && specifier.endsWith(suffix) &&
      specifier.length >= prefix.length + suffix.length;
  });
}

function exportedMatches(
  file: string,
  sought: string,
  defaultOnly: boolean,
  partition: ResolvablePartition,
  build: StructuralBuildMetadata,
  visited = new Set<string>(),
): ResolvableDefinition[] {
  const key = `${file}\0${sought}\0${defaultOnly}`;
  if (visited.has(key)) return [];
  visited.add(key);
  const direct = (partition.byFile.get(file) ?? []).filter((definition) =>
    definition.exported && (defaultOnly
      ? definition.defaultExport
      : definition.identity.qualifiedName === sought)
  );
  const concrete = direct.filter((definition) => definition.identity.kind !== "export");
  if (concrete.length > 0) {
    if (!defaultOnly) return concrete;
    const namedDefault = concrete.filter((definition) => definition.identity.name !== "default");
    return namedDefault.length > 0 ? namedDefault : concrete;
  }
  const forwarded: ResolvableDefinition[] = [];
  for (const reexport of build.importsByFile?.[file] ?? []) {
    if (reexport.form !== "esm_re_export") continue;
    const targetFile = resolveStructuralSpecifier(reexport.specifier, file, build);
    if (!targetFile) continue;
    for (const binding of reexport.bindings) {
      if (binding.local !== sought && binding.imported !== "*") continue;
      forwarded.push(...exportedMatches(
        targetFile,
        binding.imported === "*" ? sought : binding.imported,
        defaultOnly || binding.imported === "default",
        partition,
        build,
        visited,
      ));
    }
  }
  if (forwarded.length > 0) return forwarded;
  if (!defaultOnly) return direct;
  const namedDefault = direct.filter((definition) => definition.identity.name !== "default");
  return namedDefault.length > 0 ? namedDefault : direct;
}

// require()-style imports can rebind the same local name at a narrower scope
// (e.g. a function-scoped `const lib = require("./b")` shadowing a module-scope
// `const lib = require("./a")`). Only the nearest preceding require should claim
// a reference; otherwise inner-scope member access resolves to the wrong module.
// Only require-style forms are shadowers — ESM/typed redeclarations are illegal
// in JS/TS, so an esm_import with the same local name can't shadow. Lexical-scope
// tracking would be exact, but resolver definitions carry no span, so this
// positional approximation handles the common inner-shadow pattern.
const REQUIRE_IMPORT_FORMS = new Set(["commonjs_require", "dynamic_import", "ruby_require", "lua_require"]);

function importedMatches(
  file: StructuralResolverFile,
  reference: NormalizedReference,
  partition: ResolvablePartition,
  build: StructuralBuildMetadata,
): { matches: ResolvableDefinition[]; claimed: boolean } {
  const matches: ResolvableDefinition[] = [];
  let claimed = false;
  for (const imported of file.imports) {
    if (!["esm_import", "commonjs_require", "dynamic_import", "python_import", "ruby_require", "php_use", "lua_require", "c_include", "cpp_include", "go_import", "rust_use", "zig_import", "java_import", "java_static_import", "kotlin_import", "scala_import", "dart_import", "elixir_alias", "elixir_import", "elixir_require", "elixir_use", "erlang_import", "clojure_require", "clojure_import", "ocaml_open", "ocaml_include", "ocaml_module_alias", "haskell_import"].includes(imported.form)) continue;
    const typeEdge = reference.kind === "type_ref" || reference.kind === "extend" || reference.kind === "implement";
    for (const binding of imported.bindings) {
      let sought: string | undefined;
      let defaultOnly = false;
      const qualifier = reference.qualifier?.split(".") ?? [];
      if (binding.imported === "*" && qualifier[0] === binding.local) {
        const member = [...qualifier.slice(1), reference.name].join(".");
        sought = ["elixir_alias", "clojure_require", "haskell_import"].includes(imported.form)
          ? `${imported.specifier.replaceAll("/", ".")}.${member}`
          : member;
      } else if (binding.imported === "default") {
        if (qualifier[0] === binding.local) sought = [...qualifier.slice(1), reference.name].join(".");
        else if (!reference.qualifier && reference.name === binding.local) defaultOnly = true;
        else continue;
      } else if (!reference.qualifier && reference.name === binding.local) {
        sought = binding.imported;
      } else {
        continue;
      }
      claimed = true;
      if (REQUIRE_IMPORT_FORMS.has(imported.form) && imported.span.startByte <= reference.span.startByte) {
        let shadowed = false;
        for (const candidate of file.imports) {
          if (candidate === imported || !REQUIRE_IMPORT_FORMS.has(candidate.form)) continue;
          if (candidate.span.startByte <= reference.span.startByte &&
              candidate.span.startByte > imported.span.startByte &&
              candidate.bindings.some((b) => b.local === binding.local)) {
            shadowed = true;
            break;
          }
        }
        if (shadowed) continue;
      }
      if ((imported.typeOnly || binding.typeOnly) && !typeEdge) continue;
      const importedFile = resolveStructuralSpecifier(imported.specifier, file.file, build, file.dialect) ??
        (["python_import", "ruby_require", "php_use", "lua_require", "c_include", "cpp_include", "go_import", "rust_use", "zig_import", "java_import", "java_static_import", "kotlin_import", "scala_import", "dart_import", "elixir_alias", "elixir_import", "elixir_require", "elixir_use", "erlang_import", "clojure_require", "clojure_import", "ocaml_open", "ocaml_include", "ocaml_module_alias", "haskell_import"].includes(imported.form)
          ? probe(imported.specifier.replace(/^\.\//u, ""), normalizedKnownFiles(build.knownFiles), file.dialect)
          : undefined);
      if (!importedFile) continue;
      const esmDefaultMember = imported.form === "esm_import" &&
        binding.imported === "default" && qualifier[0] === binding.local;
      if (esmDefaultMember && sought !== undefined) {
        const owners = exportedMatches(importedFile, "default", true, partition, build);
        for (const owner of owners) {
          const ownerMember = `${owner.identity.qualifiedName}.${sought}`;
          matches.push(...(partition.byFileQualifiedName.get(`${owner.identity.file}\0${ownerMember}`) ?? []).filter((definition) =>
            definition.exported
          ));
        }
        continue;
      }
      if (defaultOnly) matches.push(...exportedMatches(importedFile, "default", true, partition, build));
      else if (sought !== undefined) matches.push(...exportedMatches(importedFile, sought, false, partition, build).filter((definition) =>
        binding.arity === undefined || definition.arity === binding.arity
      ));
    }
  }
  return { matches, claimed };
}

function sameFileMatches(
  file: string,
  reference: NormalizedReference,
  partition: ResolvablePartition,
): readonly ResolvableDefinition[] {
  if (reference.qualifier && reference.qualifier !== "this") {
    const exact = `${reference.qualifier}.${reference.name}`;
    return partition.byFileQualifiedName.get(`${file}\0${exact}`) ?? [];
  }
  const lexical = reference.lexicalScope?.split(".").filter(Boolean) ?? [];
  if (lexical.length > 0) lexical.pop();
  for (let length = lexical.length; length >= 0; length -= 1) {
    const prefix = lexical.slice(0, length).join(".");
    const exact = prefix ? `${prefix}.${reference.name}` : reference.name;
    const matches = partition.byFileQualifiedName.get(`${file}\0${exact}`) ?? [];
    if (matches.length > 0) return matches;
    if (reference.qualifier === "this") break;
  }
  return [];
}

export const TYPESCRIPT_LANGUAGE_RESOLVER: StructuralLanguageResolver = Object.freeze({
  version: TYPESCRIPT_RESOLVER_VERSION,
  dialects: Object.freeze(["typescript", "tsx", "javascript", "jsx"]),
  resolve(
    file: StructuralResolverFile,
    rawReference: StructuralReference,
    rawDefinitions: readonly StructuralResolverDefinition[],
    build: StructuralBuildMetadata,
  ) {
    const normalizedFile = normalizeStructuralFile(file.file);
    const reference = normalizedReference(rawReference);
    const index = definitionIndex(rawDefinitions, FAMILY_DIALECTS.has(file.dialect));
    const partition = (reference.kind && REFERENCE_PARTITION[reference.kind])
      ? index[REFERENCE_PARTITION[reference.kind]!]
      : EMPTY_PARTITION;
    if (reference.existingFqn) {
      const prepared = partition.byFqn.get(reference.existingFqn)?.identity;
      const exact = prepared ? { found: true as const, identity: prepared } : index.registry.resolveModern(reference.existingFqn);
      return exact.found
        ? Object.freeze({ status: "resolved", fqn: exact.identity.fqn, identity: exact.identity, source: "exact" })
        : Object.freeze({ status: "unresolved", name: reference.existingFqn });
    }
    const soughtQualified = reference.qualifier ? `${reference.qualifier}.${reference.name}` : reference.name;

    const local = sameFileMatches(normalizedFile, reference, partition);
    const localOutcome = outcome(reference, local, "same_file");
    if (localOutcome) return localOutcome;

    const imported = importedMatches({ ...file, file: normalizedFile }, reference, partition, build);
    const importOutcome = outcome(reference, imported.matches, "import");
    if (importOutcome) return importOutcome;
    if (imported.claimed) return Object.freeze({
      status: "unresolved",
      name: reference.name,
      ...(reference.qualifier ? { qualifier: reference.qualifier } : {}),
    });

    const globalBucket = reference.qualifier
      ? (partition.byQualifiedName.get(soughtQualified) ?? []).filter((definition) => definition.exported)
      : (partition.byQualifiedName.get(reference.name) ?? []).filter((definition) =>
          definition.exported && definition.identity.qualifiedName === definition.identity.name
        );
    return outcome(reference, globalBucket, "global") ?? Object.freeze({
      status: "unresolved",
      name: reference.name,
      ...(reference.qualifier ? { qualifier: reference.qualifier } : {}),
    });
  },
  resolveLegacy(legacyFqn: string, rawDefinitions: readonly StructuralResolverDefinition[]) {
    const { registry, all } = definitionIndex(rawDefinitions, false);
    const materialized = all.list.filter((definition) => definition.identity.legacyFqn === legacyFqn);
    const materializedOutcome = outcome(
      { kind: "call", span: { startByte: 0, endByte: 0, start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }, name: legacyFqn },
      materialized,
      "legacy",
    );
    if (materializedOutcome) return materializedOutcome;
    const result = registry.resolve(legacyFqn);
    if (result.found) {
      return Object.freeze({
        status: "resolved",
        fqn: result.identity.fqn,
        identity: result.identity,
        source: "legacy",
      });
    }
    if (result.ambiguous) {
      return Object.freeze({
        status: "ambiguous",
        name: legacyFqn,
        candidates: result.candidates,
      });
    }
    return Object.freeze({ status: "unresolved", name: legacyFqn });
  },
});
