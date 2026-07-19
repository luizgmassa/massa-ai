import type { NativeQueryCapture, NativeQueryNode } from "./grammar-loaders.js";
import type {
  StructuralQueryContext,
  StructuralQueryTree,
} from "./structural-runtime.js";
import type { StructuralQueryPack } from "./query-pack-registry.js";
import { text, field, descendants } from "./native-node-helpers.js";

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

export {
  frozenBindings,
  importBindings,
  rustUseLeaves,
  functionalCaptures,
  collectEmbeddedChildren,
};
