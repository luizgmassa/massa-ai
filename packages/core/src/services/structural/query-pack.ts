import type { NativeQueryCapture, NativeQueryNode } from "./grammar-loaders.js";
import { SourceIndex } from "./source-span.js";
import { text, frozenSpan, field, descendants, symbolName, ancestor, unquote } from "./native-node-helpers.js";
import { buildSymbols } from "./symbol-signature.js";
import type {
  LanguageManifestEntry,
  NormalizedStructuralEdge,
  NormalizedStructuralImport,
  NormalizedStructuralSymbol,
  NormalizedStructure,
  StructuralEdgeKind,
  StructuralCapability,
  StructuralCapabilityRequirement,
  StructuralSymbolKind,
  StructuralTarget,
} from "./types.js";
import type {
  StructuralQueryContext,
  StructuralQueryExecutor,
  StructuralQueryTree,
} from "./structural-runtime.js";
import {
  JAVASCRIPT_QUERY_PACK,
  TYPESCRIPT_QUERY_PACK,
} from "./query-packs/typescript.js";
import { SCRIPTING_QUERY_PACKS } from "./query-packs/scripting.js";
import { SYSTEMS_QUERY_PACKS } from "./query-packs/systems.js";
import { MANAGED_QUERY_PACKS } from "./query-packs/managed.js";
import { FUNCTIONAL_QUERY_PACKS } from "./query-packs/functional.js";
import { DATA_DOCUMENT_QUERY_PACKS } from "./query-packs/data-document.js";

export interface StructuralQueryPack {
  readonly version: string;
  readonly dialects: readonly string[];
  readonly querySources: readonly string[];
  readonly family?: "typescript" | "python" | "ruby" | "php" | "lua" | "c" | "cpp" | "go" | "rust" | "zig" |
    "java" | "kotlin" | "scala" | "csharp" | "swift" | "dart" |
    "elixir" | "erlang" | "clojure" | "ocaml" | "haskell" |
    "vue" | "markdown" | "json" | "yaml";
}

const QUERY_PACKS = new Map<string, StructuralQueryPack>(
  [...TYPESCRIPT_QUERY_PACK.dialects.map((dialect) => [dialect, TYPESCRIPT_QUERY_PACK] as const),
   ...JAVASCRIPT_QUERY_PACK.dialects.map((dialect) => [dialect, JAVASCRIPT_QUERY_PACK] as const),
   ...SCRIPTING_QUERY_PACKS.flatMap((pack) => pack.dialects.map((dialect) => [dialect, pack] as const)),
   ...SYSTEMS_QUERY_PACKS.flatMap((pack) => pack.dialects.map((dialect) => [dialect, pack] as const)),
   ...MANAGED_QUERY_PACKS.flatMap((pack) => pack.dialects.map((dialect) => [dialect, pack] as const)),
   ...FUNCTIONAL_QUERY_PACKS.flatMap((pack) => pack.dialects.map((dialect) => [dialect, pack] as const)),
   ...DATA_DOCUMENT_QUERY_PACKS.flatMap((pack) => pack.dialects.map((dialect) => [dialect, pack] as const))],
);

export const SYMBOL_KINDS = new Set<StructuralSymbolKind>([
  "class", "function", "method", "variable", "interface",
  "enum", "type", "namespace", "module", "property", "field", "type_parameter",
  "trait", "constructor", "constant", "export", "heading", "key",
]);
const LISTEN_TERMINALS = new Set([
  "on", "once", "addListener", "addEventListener", "off", "removeListener",
]);
const HTTP_CLIENTS = new Set([
  "axios", "http", "https", "got", "superagent", "request",
]);
const HTTP_METHODS = new Set([
  "get", "post", "put", "patch", "delete", "request", "head", "options",
]);

export type QueryCapabilityContract = Readonly<
  Record<StructuralCapability, StructuralCapabilityRequirement>
>;

const ALL_REQUIRED_CAPABILITIES = Object.freeze({
  declarations: "required",
  documentation: "required",
  imports: "required",
  type_relations: "required",
  calls: "required",
  data_flow: "required",
  specialized_edges: "required",
} satisfies Record<StructuralCapability, StructuralCapabilityRequirement>);

function enabled(capabilities: QueryCapabilityContract, capability: StructuralCapability): boolean {
  return capabilities[capability] === "required";
}

function queryPackFor(language: LanguageManifestEntry): StructuralQueryPack {
  const pack = QUERY_PACKS.get(language.dialect);
  if (!pack || pack.version !== language.queryPackVersion) {
    throw new Error(`structural_query_pack_unavailable:${language.dialect}@${language.queryPackVersion}`);
  }
  return pack;
}

/** Stable capture ordering and exact duplicate removal across overlapping queries. */
export function normalizeQueryCaptures(
  captures: readonly NativeQueryCapture[],
): readonly NativeQueryCapture[] {
  const sorted = [...captures].sort((left, right) =>
    left.node.startIndex - right.node.startIndex ||
    left.node.endIndex - right.node.endIndex ||
    left.name.localeCompare(right.name),
  );
  const seen = new Set<string>();
  return Object.freeze(sorted.filter((capture) => {
    const key = `${capture.name}\0${capture.node.startIndex}\0${capture.node.endIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

function frozenBindings(bindings: readonly { imported: string; local: string; typeOnly: boolean; arity?: number }[]) {
  const seen = new Set<string>();
  return Object.freeze(bindings.filter((binding) => {
    const key = `${binding.imported}\0${binding.local}\0${binding.typeOnly}\0${binding.arity ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((binding) => Object.freeze(binding)));
}

function importBindings(node: NativeQueryNode, source: Buffer) {
  const bindings: { imported: string; local: string; typeOnly: boolean }[] = [];
  const statementTypeOnly = /^(?:import|export)\s+type\b/u.test(text(source, node).trimStart());
  const clause = node.namedChildren?.find((child) => child.type === "import_clause" || child.type === "export_clause");
  for (const child of clause?.namedChildren ?? []) {
    if (child.type === "identifier") {
      bindings.push({ imported: "default", local: text(source, child), typeOnly: statementTypeOnly });
      continue;
    }
    if (child.type === "namespace_import") {
      const local = descendants(child).find((item) => item.type === "identifier");
      if (local) bindings.push({ imported: "*", local: text(source, local), typeOnly: statementTypeOnly });
      continue;
    }
    const specifiers = child.type === "import_specifier" || child.type === "export_specifier"
      ? [child]
      : descendants(child).filter((item) => item.type === "import_specifier" || item.type === "export_specifier");
    for (const specifier of specifiers) {
      const importedNode = field(specifier, "name");
      const localNode = field(specifier, "alias") ?? importedNode;
      if (importedNode && localNode) bindings.push({
        imported: text(source, importedNode),
        local: text(source, localNode),
        typeOnly: statementTypeOnly || /^type\b/u.test(text(source, specifier).trimStart()),
      });
    }
  }
  return frozenBindings(bindings);
}

interface RustUseLeaf { readonly path: readonly string[]; readonly alias?: string; readonly glob?: boolean }

function rustPathSegments(node: NativeQueryNode, source: Buffer): readonly string[] {
  if (node.type === "scoped_identifier") {
    const pathNode = field(node, "path");
    const nameNode = field(node, "name");
    return [...(pathNode ? rustPathSegments(pathNode, source) : []), ...(nameNode ? rustPathSegments(nameNode, source) : [])];
  }
  if (["identifier", "crate", "self", "super", "metavariable"].includes(node.type)) return [text(source, node)];
  return (node.namedChildren ?? []).flatMap((child) => rustPathSegments(child, source));
}

function rustUseLeaves(node: NativeQueryNode, source: Buffer, prefix: readonly string[] = []): readonly RustUseLeaf[] {
  if (node.type === "use_declaration") {
    const argument = field(node, "argument") ?? node.namedChildren?.[0];
    return argument ? rustUseLeaves(argument, source, prefix) : [];
  }
  if (node.type === "scoped_use_list") {
    const pathNode = field(node, "path");
    const list = field(node, "list") ?? node.namedChildren?.find((child) => child.type === "use_list");
    const nextPrefix = [...prefix, ...(pathNode ? rustPathSegments(pathNode, source) : [])];
    return list ? rustUseLeaves(list, source, nextPrefix) : [];
  }
  if (node.type === "use_list") return (node.namedChildren ?? []).flatMap((child) => rustUseLeaves(child, source, prefix));
  if (node.type === "use_as_clause") {
    const pathNode = field(node, "path") ?? node.namedChildren?.[0];
    const alias = field(node, "alias");
    return pathNode ? [{ path: [...prefix, ...rustPathSegments(pathNode, source)], ...(alias ? { alias: text(source, alias) } : {}) }] : [];
  }
  if (node.type === "use_wildcard") return [{ path: [...prefix, "*"], glob: true }];
  const path = rustPathSegments(node, source);
  return path.length ? [{ path: [...prefix, ...path] }] : [];
}

function buildImports(
  captures: readonly NativeQueryCapture[],
  source: Buffer,
  index: SourceIndex,
  family: StructuralQueryPack["family"] = "typescript",
): readonly NormalizedStructuralImport[] {
  const scripting = captures.filter((capture) => capture.name.startsWith("import.")).flatMap((capture) => {
    const normalized = (
      form: NormalizedStructuralImport["form"],
      specifier: string,
      bindings: readonly { imported: string; local: string; typeOnly: boolean }[],
    ): NormalizedStructuralImport => {
      const frozen = frozenBindings(bindings);
      return Object.freeze({
        form, specifier, span: frozenSpan(index, capture.node.startIndex, capture.node.endIndex),
        bindings: frozen, names: Object.freeze(frozen.map((item) => item.local)), typeOnly: false,
      });
    };
    if (capture.name === "import.python") {
      const moduleNode = field(capture.node, "module_name") ?? field(capture.node, "name");
      if (!moduleNode) return [];
      if (capture.node.type === "import_statement") {
        return (capture.node.namedChildren ?? []).map((imported) => {
          const nameNode = field(imported, "name") ?? imported;
          const aliasNode = field(imported, "alias");
          const importedName = text(source, nameNode).replaceAll(".", "/");
          return normalized("python_import", importedName, [{
            imported: "*", local: aliasNode ? text(source, aliasNode) : importedName.split("/")[0]!, typeOnly: false,
          }]);
        });
      }
      const moduleName = text(source, moduleNode);
      let relativeDots = 0;
      while (moduleName[relativeDots] === ".") relativeDots += 1;
      const modulePath = moduleName.slice(relativeDots).replaceAll(".", "/");
      const specifier = relativeDots > 0
        ? `${relativeDots === 1 ? "./" : "../".repeat(relativeDots - 1)}${modulePath}`
        : modulePath;
      const bindings: { imported: string; local: string; typeOnly: boolean }[] = [];
      for (const imported of (capture.node.namedChildren ?? []).filter((node) => node !== moduleNode && node.type !== "import_prefix")) {
        const nameNode = field(imported, "name") ?? imported;
        if (!["aliased_import", "dotted_name", "identifier", "wildcard_import"].includes(imported.type)) continue;
        const importedName = text(source, nameNode);
        bindings.push({ imported: importedName, local: field(imported, "alias") ? text(source, field(imported, "alias")!) : importedName, typeOnly: false });
      }
      return [normalized("python_import", specifier, bindings)];
    } else if (capture.name === "import.php") {
      const group = descendants(capture.node).find((node) => node.type === "namespace_use_group");
      const prefixNode = group
        ? capture.node.namedChildren?.find((node) => node.type === "namespace_name")
        : undefined;
      return descendants(capture.node).filter((node) => node.type === "namespace_use_clause").flatMap((clause) => {
        const nameNode = clause.namedChildren?.find((node) => node.type === "qualified_name" || node.type === "name");
        if (!nameNode) return [];
        const rawName = `${prefixNode ? `${text(source, prefixNode)}\\` : ""}${text(source, nameNode)}`;
        const imported = text(source, nameNode).split("\\").at(-1)!;
        const alias = field(clause, "alias");
        return [normalized("php_use", rawName.replaceAll("\\", "/"), [{
          imported, local: alias ? text(source, alias) : imported, typeOnly: false,
        }])];
      });
    } else if (capture.name === "import.c" || capture.name === "import.cpp") {
      const pathNode = field(capture.node, "path");
      if (!pathNode) return [];
      const raw = text(source, pathNode).trim();
      const specifier = raw.startsWith("<") && raw.endsWith(">") ? raw : unquote(raw);
      return [normalized(capture.name === "import.c" ? "c_include" : "cpp_include", specifier, [])];
    } else if (capture.name === "import.go") {
      const pathNode = field(capture.node, "path");
      if (!pathNode) return [];
      const specifier = unquote(text(source, pathNode));
      const alias = field(capture.node, "name");
      const local = alias ? text(source, alias) : specifier.split("/").at(-1)!;
      return [normalized("go_import", specifier, [{ imported: "*", local, typeOnly: false }])];
    } else if (capture.name === "import.rust") {
      const grouped = new Map<string, { imported: string; local: string; typeOnly: boolean }[]>();
      for (const leaf of rustUseLeaves(capture.node, source)) {
        if (leaf.path.length === 0) continue;
        const terminal = leaf.path.at(-1)!;
        const importsModuleSelf = terminal === "self";
        const moduleParts = importsModuleSelf ? leaf.path.slice(0, -1)
          : leaf.path.length === 1 ? leaf.path : leaf.path.slice(0, -1);
        const specifier = moduleParts.join("/");
        const imported = leaf.glob || importsModuleSelf ? "*" : leaf.path.length === 1 ? "*" : terminal;
        const local = leaf.alias ?? (leaf.glob ? "*" : importsModuleSelf ? moduleParts.at(-1)! : terminal);
        const bindings = grouped.get(specifier) ?? [];
        bindings.push({ imported, local, typeOnly: false });
        grouped.set(specifier, bindings);
      }
      return [...grouped.entries()].map(([specifier, bindings]) => normalized("rust_use", specifier, bindings));
    } else if (capture.name === "import.zig") {
      const builtin = capture.node.namedChildren?.find((node) => node.type === "builtin_identifier");
      if (!builtin || text(source, builtin) !== "@import") return [];
      const argument = descendants(capture.node).find((node) => node.type === "string");
      if (!argument) return [];
      const assignment = ancestor(capture.node, "variable_declaration");
      const local = assignment?.namedChildren?.find((node) => node.type === "identifier");
      return [normalized("zig_import", unquote(text(source, argument)), local ? [{ imported: "*", local: text(source, local), typeOnly: false }] : [])];
    } else if (capture.name === "import.scala") {
      const direct = capture.node.namedChildren ?? [];
      const selectorList = direct.find((node) => node.type === "namespace_selectors");
      const directPaths = direct.filter((node) => ["identifier", "stable_identifier"].includes(node.type)).map((node) => text(source, node));
      if (selectorList) return (selectorList.namedChildren ?? []).flatMap((selector) => {
        const importedNode = field(selector, "name") ?? (selector.type === "identifier" ? selector : selector.namedChildren?.[0]);
        if (!importedNode) return [];
        const alias = field(selector, "alias");
        const imported = text(source, importedNode);
        return [normalized("scala_import", [...directPaths, imported].join("/"), [{ imported, local: alias ? text(source, alias) : imported, typeOnly: false }])];
      });
      if (directPaths.length === 0) return [];
      const imported = directPaths.at(-1)!;
      return [normalized("scala_import", directPaths.join("/"), [{ imported, local: imported, typeOnly: false }])];
    } else if (["import.java", "import.kotlin"].includes(capture.name)) {
      const pathNode = descendants(capture.node).find((node) =>
        ["scoped_identifier", "qualified_identifier", "stable_identifier"].includes(node.type)
      );
      if (!pathNode) return [];
      const segments = descendants(pathNode).filter((node) =>
        ["identifier", "type_identifier"].includes(node.type) &&
        !(node.namedChildren?.length)
      ).map((node) => text(source, node));
      if (segments.length === 0) return [];
      const wildcard = descendants(capture.node).some((node) => ["asterisk", "wildcard"].includes(node.type));
      const staticMember = capture.name === "import.java" && (capture.node.children ?? []).some((node) => node.type === "static");
      const aliasNode = field(capture.node, "alias") ?? capture.node.namedChildren?.find((node) => node.type === "import_alias")?.namedChildren?.at(-1) ??
        (capture.name === "import.kotlin" ? capture.node.namedChildren?.find((node) => node.type === "identifier" && node.startIndex > pathNode.endIndex) : undefined);
      const imported = wildcard ? "*" : segments.at(-1)!;
      const moduleSegments = staticMember && !wildcard ? segments.slice(0, -1) : segments;
      return [normalized(
        capture.name === "import.java" ? staticMember ? "java_static_import" : "java_import" : "kotlin_import",
        moduleSegments.join("/"), [{ imported, local: aliasNode ? text(source, aliasNode) : imported, typeOnly: false }],
      )];
    } else if (capture.name === "import.dart") {
      const uri = descendants(capture.node).find((node) => ["string_literal", "uri"].includes(node.type));
      if (!uri) return [];
      const alias = descendants(capture.node).find((node) => node.type === "identifier" && node.parent?.type === "import_specification");
      const combinators = descendants(capture.node).filter((node) => node.type === "combinator");
      const shown = combinators.filter((node) => (node.children ?? []).some((child) => child.type === "show")).flatMap((node) =>
        (node.namedChildren ?? []).filter((child) => child.type === "identifier").map((child) => text(source, child))
      );
      const hidden = combinators.filter((node) => (node.children ?? []).some((child) => child.type === "hide")).flatMap((node) =>
        (node.namedChildren ?? []).filter((child) => child.type === "identifier").map((child) => text(source, child))
      );
      const bindings = alias ? [{ imported: "*", local: text(source, alias), typeOnly: false }]
        : shown.length ? shown.map((name) => ({ imported: name, local: name, typeOnly: false }))
        : [{ imported: "*", local: "*", typeOnly: false }, ...hidden.map((name) => ({ imported: `!${name}`, local: `!${name}`, typeOnly: false }))];
      const rawSpecifier = unquote(text(source, uri));
      const specifier = /^(?:[a-z]+:|\/|\.\.?\/)/u.test(rawSpecifier) ? rawSpecifier : `./${rawSpecifier}`;
      return [normalized("dart_import", specifier, bindings)];
    } else if (capture.name === "import.csharp" || capture.name === "import.swift") {
      // Namespace/module syntax does not identify a source path without build metadata.
      const name = field(capture.node, "name") ?? descendants(capture.node).find((node) =>
        ["qualified_name", "identifier", "simple_identifier"].includes(node.type)
      );
      return name ? [normalized(capture.name === "import.csharp" ? "csharp_using" : "swift_import", text(source, name), [])] : [];
    } else if (capture.name === "import.elixir") {
      const target = field(capture.node, "target");
      const form = target ? text(source, target) : "";
      const args = capture.node.namedChildren?.find((node) => node.type === "arguments");
      const moduleNode = args?.namedChildren?.[0];
      if (!moduleNode || !["alias", "import", "require", "use"].includes(form)) return [];
      const moduleName = text(source, moduleNode);
      const pairs = descendants(args!).filter((node) => node.type === "pair");
      const pairNamed = (key: string) => pairs.find((pair) => {
        const keyNode = field(pair, "key");
        return keyNode && text(source, keyNode).replace(/:\s*$/u, "") === key;
      });
      const asPair = pairNamed("as");
      const asValue = asPair ? field(asPair, "value") : null;
      const onlyPair = pairNamed("only");
      const onlyValue = onlyPair ? field(onlyPair, "value") : null;
      const named = onlyValue ? descendants(onlyValue).filter((node) => node.type === "pair").flatMap((pair) => {
        const keyNode = field(pair, "key");
        const valueNode = field(pair, "value");
        return keyNode ? [{ name: text(source, keyNode).replace(/:\s*$/u, ""), arity: valueNode ? Number(text(source, valueNode)) : undefined }] : [];
      }) : [];
      const local = asValue ? text(source, asValue) : moduleName.split(".").at(-1)!;
      const bindings = named.length ? named.map(({ name, arity }) => ({ imported: name, local: name, typeOnly: false, ...(Number.isSafeInteger(arity) ? { arity } : {}) }))
        : [{ imported: "*", local, typeOnly: false }];
      return [normalized(`elixir_${form}` as NormalizedStructuralImport["form"], moduleName.replaceAll(".", "/"), bindings)];
    } else if (capture.name === "import.erlang") {
      const moduleNode = field(capture.node, "module");
      if (!moduleNode) return [];
      const bindings = (field(capture.node, "funs") ? descendants(capture.node) : capture.node.namedChildren ?? [])
        .filter((node) => node.type === "fa").map((node) => {
          const name = field(node, "name") ?? node.namedChildren?.[0];
          const imported = name ? text(source, name) : text(source, node).split("/")[0]!;
          const arityNode = field(node, "arity");
          const integer = arityNode ? descendants(arityNode).find((child) => child.type === "integer") : undefined;
          const arity = integer ? Number(text(source, integer)) : undefined;
          return { imported, local: imported, typeOnly: false, ...(Number.isSafeInteger(arity) ? { arity } : {}) };
        });
      return [normalized("erlang_import", text(source, moduleNode), bindings)];
    } else if (capture.name === "import.clojure") {
      const forms = descendants(capture.node).filter((node) => node.type === "list_lit" || node.type === "vec_lit");
      return forms.flatMap((formNode) => {
        const values = (formNode.namedChildren ?? []).filter((node) => node.type !== "comment");
        const directive = values[0] ? text(source, values[0]) : "";
        if (![":require", ":import"].includes(directive)) return [];
        return values.slice(1).flatMap((entry) => {
          const parts = (entry.namedChildren ?? []).filter((node) => node.type !== "comment");
          const moduleNode = entry.type === "vec_lit" ? parts[0] : entry;
          if (!moduleNode) return [];
          const moduleName = text(source, moduleNode);
          const asIndex = parts.findIndex((node) => text(source, node) === ":as");
          const alias = asIndex >= 0 ? parts[asIndex + 1] : undefined;
          const local = alias ? text(source, alias) : moduleName.split(".").at(-1)!;
          const referIndex = parts.findIndex((node) => text(source, node) === ":refer");
          const refer = referIndex >= 0 ? parts[referIndex + 1] : undefined;
          const referred = refer?.type === "vec_lit" ? (refer.namedChildren ?? []).filter((node) => node.type === "sym_lit").map((node) => text(source, node)) : [];
          const bindings = referred.length ? referred.map((name) => ({ imported: name, local: name, typeOnly: false }))
            : [{ imported: "*", local, typeOnly: false }];
          return [normalized(directive === ":require" ? "clojure_require" : "clojure_import", moduleName.replaceAll(".", "/"), bindings)];
        });
      });
    } else if (capture.name === "import.ocaml") {
      const moduleNode = field(capture.node, "module");
      return moduleNode ? [normalized(capture.node.type === "open_module" ? "ocaml_open" : "ocaml_include", text(source, moduleNode).replaceAll(".", "/"), [])] : [];
    } else if (capture.name === "import.ocaml.module") {
      const binding = descendants(capture.node).find((node) => node.type === "module_binding");
      const body = binding ? field(binding, "body") : null;
      const local = binding?.namedChildren?.find((node) => node.type === "module_name");
      if (!body || body.type !== "module_path" || !local) return [];
      return [normalized("ocaml_module_alias", text(source, body).replaceAll(".", "/"), [{ imported: "*", local: text(source, local), typeOnly: false }])];
    } else if (capture.name === "import.haskell") {
      const moduleNode = field(capture.node, "module");
      if (!moduleNode) return [];
      const alias = field(capture.node, "alias");
      const names = field(capture.node, "names");
      const importedNames = names ? descendants(names).filter((node) => node.type === "import_name").map((node) => text(source, node)) : [];
      const qualified = (capture.node.children ?? []).some((node) => node.type === "qualified");
      const hiding = (capture.node.children ?? []).some((node) => node.type === "hiding");
      const moduleLocal = alias ? text(source, alias) : text(source, moduleNode).split(".").at(-1)!;
      const bindings = qualified ? [{ imported: "*", local: moduleLocal, typeOnly: false }]
        : hiding ? [{ imported: "*", local: "*", typeOnly: false }, ...importedNames.map((name) => ({ imported: `!${name}`, local: `!${name}`, typeOnly: false }))]
        : importedNames.length ? importedNames.map((name) => ({ imported: name, local: name, typeOnly: false }))
        : [{ imported: "*", local: "*", typeOnly: false }];
      return [normalized("haskell_import", text(source, moduleNode).replaceAll(".", "/"), bindings)];
    } else return [];
  });
  const statements = captures
    .filter((capture) => capture.name === "import.statement" || (capture.name === "export.statement" && field(capture.node, "source")))
    .flatMap((capture) => {
      const sourceNode = field(capture.node, "source");
      if (!sourceNode) return [];
      const statement = text(source, capture.node).trimStart();
      const parsedBindings = importBindings(capture.node, source);
      const bindings = capture.name === "export.statement" && parsedBindings.length === 0 && /^export\s*\*/u.test(statement)
        ? frozenBindings([{ imported: "*", local: "*", typeOnly: false }])
        : parsedBindings;
      return [Object.freeze({
        form: capture.name === "export.statement" ? "esm_re_export" : "esm_import",
        specifier: unquote(text(source, sourceNode)),
        span: frozenSpan(index, capture.node.startIndex, capture.node.endIndex),
        bindings,
        names: Object.freeze(bindings.map((binding) => binding.local)),
        typeOnly: /^(?:import|export)\s+type\b/u.test(statement),
      } satisfies NormalizedStructuralImport)];
    });
  const requires = captures
    .filter((capture) => capture.name === "edge.call")
    .flatMap((capture) => {
      const targetNode = field(capture.node, "function") ?? field(capture.node, "method") ?? field(capture.node, "name");
      const argumentsNode = field(capture.node, "arguments");
      const argument = argumentsNode?.namedChildren?.[0];
      const target = targetNode ? text(source, targetNode) : "";
      const requireTargets = family === "ruby" ? ["require", "require_relative"] : ["require", "import"];
      if (!targetNode || !requireTargets.includes(target) || !argument || !["string", "encapsed_string"].includes(argument.type)) return [];
      const declarator = ancestor(capture.node, "variable_declarator");
      const luaAssignment = family === "lua" ? ancestor(capture.node, "assignment_statement") : undefined;
      const localNode = declarator
        ? field(declarator, "name")
        : luaAssignment?.namedChildren?.[0]?.namedChildren?.[0] ?? null;
      const rawBindings: { imported: string; local: string; typeOnly: boolean }[] = [];
      if (target === "require" && localNode?.type === "identifier") {
        rawBindings.push({ imported: "default", local: text(source, localNode), typeOnly: false });
      } else if (target === "import" && localNode?.type === "identifier") {
        rawBindings.push({ imported: "*", local: text(source, localNode), typeOnly: false });
      } else if (target === "require" && localNode) {
        for (const child of localNode.namedChildren ?? []) {
          const importedNode = field(child, "key") ?? field(child, "name") ?? child;
          const localBinding = field(child, "value") ?? field(child, "alias") ?? importedNode;
          const importedName = text(source, importedNode).trim();
          const localName = text(source, localBinding).trim();
          if (importedName && localName) rawBindings.push({
            imported: importedName,
            local: localName,
            typeOnly: false,
          });
        }
      }
      const bindings = frozenBindings(rawBindings);
      return [Object.freeze({
        form: family === "ruby" ? "ruby_require" : family === "lua" ? "lua_require" : target === "require" ? "commonjs_require" : "dynamic_import",
        specifier: unquote(text(source, argument)),
        span: frozenSpan(index, capture.node.startIndex, capture.node.endIndex),
        bindings,
        names: Object.freeze(bindings.map((binding) => binding.local)),
        typeOnly: false,
      } satisfies NormalizedStructuralImport)];
    });
  return Object.freeze([...statements, ...scripting, ...requires].sort((left, right) => left.span.startByte - right.span.startByte));
}

function unresolved(name: string, qualifier?: string): StructuralTarget {
  return Object.freeze({ status: "unresolved", name, ...(qualifier ? { qualifier } : {}) });
}

function targetParts(raw: string): { name: string; qualifier?: string } {
  const normalized = raw.replace(/\s+/gu, "").replace(/\?\./gu, ".");
  const parts = normalized.split(/[.:/]/u).filter(Boolean);
  return { name: parts.at(-1) ?? normalized, ...(parts.length > 1 ? { qualifier: parts.slice(0, -1).join(".") } : {}) };
}

function callKind(rawTarget: string, firstArgument?: string): StructuralEdgeKind {
  const { name, qualifier } = targetParts(rawTarget);
  if (name === "emit") return "emit";
  if (LISTEN_TERMINALS.has(name)) return "listen";
  if (name === "fetch" || name === "graphql" || name === "gql") return "http_call";
  const root = qualifier?.split(".")[0];
  if ((root && HTTP_CLIENTS.has(root) && HTTP_METHODS.has(name)) || (root === "trpc" && ["query", "mutate", "subscribe"].includes(name))) {
    return "http_call";
  }
  const literal = firstArgument ? unquote(firstArgument) : "";
  if (/^(?:https?:\/\/|\/api(?:\/|$))/u.test(literal)) return "http_call";
  return "call";
}

function buildCallEdges(
  captures: readonly NativeQueryCapture[],
  source: Buffer,
  index: SourceIndex,
  capabilities: QueryCapabilityContract,
): NormalizedStructuralEdge[] {
  const edges: NormalizedStructuralEdge[] = [];
  for (const capture of captures) {
    if (capture.name !== "edge.call") continue;
    const targetNode = field(capture.node, "function") ?? field(capture.node, "constructor") ?? field(capture.node, "method") ?? field(capture.node, "name") ?? field(capture.node, "target") ?? field(capture.node, "expr") ??
      (capture.node.type === "selector" ? capture.node.parent?.namedChildren?.find((node) => node.endIndex <= capture.node.startIndex) : undefined) ??
      capture.node.namedChildren?.find((node) => !["value_arguments", "argument_list", "call_suffix", "arguments"].includes(node.type));
    const argumentsNode = field(capture.node, "arguments") ?? capture.node.namedChildren?.find((node) =>
      ["value_arguments", "argument_list", "call_suffix", "arguments", "expr_args"].includes(node.type)
    ) ?? descendants(capture.node).find((node) => ["value_arguments", "argument_list", "arguments", "expr_args"].includes(node.type));
    if (!targetNode) continue;
    const argumentContainer = argumentsNode?.type === "call_suffix"
      ? descendants(argumentsNode).find((node) => ["value_arguments", "argument_list", "arguments"].includes(node.type))
      : argumentsNode;
    const argumentNodes = argumentContainer?.namedChildren ?? (capture.node.namedChildren ?? []).filter((node) => node !== targetNode);
    const rawTarget = text(source, targetNode);
    if (["require", "require_relative", "import"].includes(rawTarget)) continue;
    const firstArgument = argumentNodes[0] ? text(source, argumentNodes[0]) : undefined;
    const kind = callKind(rawTarget, firstArgument);
    const parts = targetParts(rawTarget);
    let targetName = parts.name;
    let metadata: Record<string, unknown> | undefined;
    if (kind === "emit" || kind === "listen") {
      targetName = firstArgument ? unquote(firstArgument) : parts.name;
      metadata = { event: targetName };
    } else if (kind === "http_call") {
      const route = firstArgument ? unquote(firstArgument) : undefined;
      metadata = { client: parts.qualifier?.split(".")[0] ?? parts.name, ...(route ? { route } : {}) };
    }
    const emitMainEdge = kind === "call"
      ? enabled(capabilities, "calls")
      : enabled(capabilities, "specialized_edges");
    if (emitMainEdge) {
      edges.push({
        kind,
        span: frozenSpan(index, capture.node.startIndex, capture.node.endIndex),
        target: unresolved(targetName, kind === "call" ? parts.qualifier : undefined),
        ...(kind !== "call" && metadata ? { metadata: Object.freeze(metadata) } : {}),
      });
    }
    if (!enabled(capabilities, "data_flow")) continue;
    for (let paramIndex = 0; paramIndex < argumentNodes.length; paramIndex += 1) {
      const argument = argumentNodes[paramIndex]!;
      const flowNode = ["argument", "value_argument", "simple_parameter"].includes(argument.type)
        ? argument.namedChildren?.[0] ?? argument
        : argument;
      if (!["identifier", "simple_identifier", "variable_name", "var", "value_path", "value_name", "variable", "sym_lit"].includes(flowNode.type)) continue;
      edges.push({
        kind: "data_flow",
        span: frozenSpan(index, flowNode.startIndex, flowNode.endIndex),
        target: unresolved(parts.name, parts.qualifier),
        paramIndex,
        metadata: Object.freeze({ argument: text(source, flowNode) }),
      });
    }
  }
  return edges;
}

function buildSyntaxEdges(
  captures: readonly NativeQueryCapture[],
  source: Buffer,
  index: SourceIndex,
): NormalizedStructuralEdge[] {
  const result: NormalizedStructuralEdge[] = [];
  for (const capture of captures) {
    if (!capture.name.startsWith("edge.") || capture.name === "edge.call") continue;
    if (capture.name === "edge.type_ref_container") {
      for (const targetNode of descendants(capture.node).filter((node) => node.type === "type_identifier")) {
        const parts = targetParts(text(source, targetNode));
        result.push({
          kind: "type_ref",
          span: frozenSpan(index, targetNode.startIndex, targetNode.endIndex),
          target: unresolved(parts.name, parts.qualifier),
        });
      }
      continue;
    }
    if (capture.name === "edge.type_ref_value") {
      const nodes = capture.node.type === "type_identifier" || capture.node.type === "nested_type_identifier"
        ? [capture.node]
        : descendants(capture.node).filter((node) => node.type === "type_identifier" || node.type === "nested_type_identifier");
      for (const targetNode of nodes) {
        const parts = targetParts(text(source, targetNode));
        result.push({
          kind: "type_ref",
          span: frozenSpan(index, targetNode.startIndex, targetNode.endIndex),
          target: unresolved(parts.name, parts.qualifier),
        });
      }
      continue;
    }
    if (capture.name === "edge.type_argument_container") {
      for (const expression of capture.node.namedChildren ?? []) {
        const targetNode = expression.type === "generic_type" ? field(expression, "name") : expression;
        if (!targetNode || !["type_identifier", "nested_type_identifier"].includes(targetNode.type)) continue;
        const parts = targetParts(text(source, targetNode));
        result.push({
          kind: "type_ref",
          span: frozenSpan(index, targetNode.startIndex, targetNode.endIndex),
          target: unresolved(parts.name, parts.qualifier),
        });
      }
      continue;
    }
    if (capture.name === "edge.implement_container") {
      for (const expression of capture.node.namedChildren ?? []) {
        const targetNode = expression.type === "generic_type" ? field(expression, "name") : expression;
        if (!targetNode) continue;
        const parts = targetParts(text(source, targetNode));
        result.push({
          kind: "implement",
          span: frozenSpan(index, targetNode.startIndex, targetNode.endIndex),
          target: unresolved(parts.name, parts.qualifier),
        });
      }
      continue;
    }
    if (capture.name === "edge.extend_container") {
      const expression = capture.node.namedChildren?.[0];
      if (expression) {
        const parts = targetParts(text(source, expression));
        result.push({
          kind: "extend",
          span: frozenSpan(index, expression.startIndex, expression.endIndex),
          target: unresolved(parts.name, parts.qualifier),
        });
      }
      continue;
    }
    const kind = capture.name.slice("edge.".length) as StructuralEdgeKind;
    if (!(["type_ref", "extend", "implement"] as const).includes(kind as "type_ref" | "extend" | "implement")) continue;
    const relationNode = capture.node.type === "generic_type"
      ? field(capture.node, "name") ?? capture.node
      : capture.node;
    const parts = targetParts(text(source, relationNode));
    result.push({
      kind,
      span: frozenSpan(index, relationNode.startIndex, relationNode.endIndex),
      target: unresolved(parts.name, parts.qualifier),
    });
  }
  return result;
}

function dedupeEdges(edges: readonly NormalizedStructuralEdge[]): readonly NormalizedStructuralEdge[] {
  const seen = new Set<string>();
  return Object.freeze(edges.filter((edge) => {
    const target = edge.target.status === "resolved" ? edge.target.fqn : `${edge.target.qualifier ?? ""}#${edge.target.name}`;
    const key = `${edge.kind}\0${edge.span.startByte}\0${edge.span.endByte}\0${target}\0${edge.paramIndex ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((edge) => Object.freeze(edge)));
}

function functionalCaptures(
  captures: readonly NativeQueryCapture[],
  source: Buffer,
  family: StructuralQueryPack["family"],
): readonly NativeQueryCapture[] {
  if (family !== "clojure") return captures;
  const result: NativeQueryCapture[] = [];
  for (const capture of captures) {
    if (capture.name !== "form.clojure") {
      result.push(capture);
      continue;
    }
    const values = (capture.node.namedChildren ?? []).filter((child) => child.type !== "comment");
    const head = values[0] ? text(source, values[0]) : "";
    const declaration = head === "ns" ? "symbol.module"
      : ["defn", "defn-", "defmacro"].includes(head) ? "symbol.function"
      : head === "defprotocol" ? "symbol.interface"
      : ["defrecord", "deftype"].includes(head) ? "symbol.class"
      : head === "def" ? "symbol.variable" : undefined;
    if (declaration) result.push({ ...capture, name: declaration });
    if (head === "ns") result.push({ ...capture, name: "import.clojure" });
    if (!declaration && head && !head.startsWith(":")) result.push({ ...capture, name: "edge.call" });
  }
  return normalizeQueryCaptures(result);
}

export function executeQueryPack(
  pack: StructuralQueryPack,
  tree: StructuralQueryTree,
  source: Buffer,
  context: StructuralQueryContext,
  capabilities: QueryCapabilityContract = ALL_REQUIRED_CAPABILITIES,
): NormalizedStructure {
  collectEmbeddedChildren(pack, tree, source, context);
  const captures = functionalCaptures(normalizeQueryCaptures(pack.querySources.flatMap((querySource) =>
    context.query(querySource, tree.rootNode),
  )), source, pack.family);
  const index = new SourceIndex(source);
  const imports = enabled(capabilities, "imports") ? buildImports(captures, source, index, pack.family) : Object.freeze([]);
  const importEdges: NormalizedStructuralEdge[] = imports.map((item) => ({
    kind: "import",
    span: item.span,
    target: unresolved(item.specifier),
    metadata: Object.freeze({ bindings: item.bindings, names: item.names, typeOnly: item.typeOnly }),
  }));
  return Object.freeze({
    symbols: enabled(capabilities, "declarations")
      ? buildSymbols(captures, source, index, enabled(capabilities, "documentation"), pack.family)
      : Object.freeze([]),
    edges: dedupeEdges([
      ...buildCallEdges(captures, source, index, capabilities),
      ...(enabled(capabilities, "type_relations") ? buildSyntaxEdges(captures, source, index) : []),
      ...importEdges,
    ]),
    imports,
  });
}

const EMBEDDED_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  js: ".js", javascript: ".js", jsx: ".jsx",
  ts: ".ts", typescript: ".ts", tsx: ".tsx",
  markdown: ".md", md: ".md", json: ".json", yaml: ".yaml", yml: ".yml",
  python: ".py", py: ".py", ruby: ".rb", rb: ".rb", go: ".go", rust: ".rs", rs: ".rs",
  java: ".java", kotlin: ".kt", scala: ".scala", c: ".c", cpp: ".cpp", csharp: ".cs",
});

function collectEmbeddedChildren(
  pack: StructuralQueryPack,
  tree: StructuralQueryTree,
  source: Buffer,
  context: StructuralQueryContext,
): void {
  // Only Vue and Markdown host embedded child languages. Walking the full AST
  // (via the byte-wrapping adapter, which materializes a wrapper per node) for
  // every other family is pure waste on the hot parse path, so skip it entirely
  // unless this pack actually declares embedded children.
  if (pack.family !== "vue" && pack.family !== "markdown") {
    return;
  }
  const root = tree.rootNode as NativeQueryNode;
  const nodes = [root, ...descendants(root)];
  if (pack.family === "vue") {
    let ordinal = 0;
    for (const node of nodes.filter((candidate) => candidate.type === "script_element")) {
      const content = node.namedChildren?.find((child) => child.type === "raw_text");
      if (!content) continue;
      const startTag = node.namedChildren?.find((child) => child.type === "start_tag");
      const langAttribute = startTag?.namedChildren?.find((child) =>
        child.type === "attribute" && child.namedChildren?.some((part) =>
          part.type === "attribute_name" && text(source, part).toLowerCase() === "lang"
        )
      );
      const langValue = langAttribute?.namedChildren?.find((part) =>
        part.type === "quoted_attribute_value" || part.type === "attribute_value"
      );
      const nestedValue = langValue?.type === "quoted_attribute_value"
        ? langValue.namedChildren?.find((part) => part.type === "attribute_value")
        : langValue;
      const lang = nestedValue ? text(source, nestedValue).trim().toLowerCase() : "js";
      context.collectEmbeddedSlice({
        extension: EMBEDDED_EXTENSIONS[lang] ?? `.${lang}`,
        startByte: content.startIndex,
        endByte: content.endIndex,
        scope: `vue.script[${ordinal}]`,
      });
      ordinal += 1;
    }
  }
  if (pack.family === "markdown") {
    let ordinal = 0;
    for (const node of nodes.filter((candidate) => candidate.type === "fenced_code_block")) {
      const info = node.namedChildren?.find((child) => child.type === "info_string");
      const content = node.namedChildren?.find((child) => child.type === "code_fence_content");
      if (!content) continue;
      const declared = info ? text(source, info).trim().split(/\s+/u)[0]!.toLowerCase() : "plain";
      context.collectEmbeddedSlice({
        extension: EMBEDDED_EXTENSIONS[declared] ?? `.${declared}`,
        startByte: content.startIndex,
        endByte: content.endIndex,
        scope: `markdown.fence[${ordinal}]`,
      });
      ordinal += 1;
    }
  }
}

export const executeStructuralQueryPack: StructuralQueryExecutor = (
  tree,
  source,
  language,
  context,
) => executeQueryPack(queryPackFor(language), tree, source, context, language.capabilities);

export function structuralQueryPackForDialect(dialect: string): StructuralQueryPack | undefined {
  return QUERY_PACKS.get(dialect);
}
