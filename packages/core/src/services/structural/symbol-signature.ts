import type { NativeQueryCapture, NativeQueryNode } from "./grammar-loaders.js";
import { SourceIndex } from "./source-span.js";
import type {
  NormalizedStructuralSymbol,
  StructuralSymbolKind,
} from "./types.js";
import { SYMBOL_KINDS } from "./query-pack.js";
import type { StructuralQueryPack } from "./query-pack.js";
import {
  text,
  frozenSpan,
  field,
  descendants,
  symbolName,
  ancestor,
} from "./native-node-helpers.js";

interface SymbolDraft {
  kind: StructuralSymbolKind;
  name: string;
  node: NativeQueryNode;
  qualifiedName: string;
}

function symbolKind(captureName: string, source: Buffer, node: NativeQueryNode): StructuralSymbolKind | null {
  const requested = captureName.slice("symbol.".length) as StructuralSymbolKind;
  if (!SYMBOL_KINDS.has(requested)) return null;
  if (requested === "method" && symbolName(source, node) === "constructor") return "constructor";
  if (requested === "function" && node.type === "function_definition" &&
    ancestor(node, "class_specifier")) return "method";
  if (requested === "namespace" && text(source, node).trimStart().startsWith("module ")) return "module";
  if (requested === "variable") {
    const value = field(node, "value");
    if (value?.type === "arrow_function" || value?.type === "function_expression") return "function";
    const parentText = node.parent ? text(source, node.parent).trimStart() : "";
    return parentText.startsWith("const ") ? "constant" : "variable";
  }
  if (node.type === "type_spec") {
    const value = field(node, "type");
    if (value?.type === "struct_type") return "class";
    if (value?.type === "interface_type") return "interface";
  }
  if (node.type === "variable_declaration") {
    const value = node.namedChildren?.[1];
    if (value?.type === "struct_declaration") return "class";
    if (value?.type === "enum_declaration") return "enum";
  }
  return requested;
}

function leadingDocumentation(source: Buffer, startByte: number): string | undefined {
  const prefix = source.subarray(0, startByte).toString("utf8");
  const match = prefix.match(/(?:\/\*\*[\s\S]*?\*\/|(?:\/\/[^\n]*(?:\n|$))+)[\t ]*\r?\n?[\t ]*$/u);
  return match?.[0].trim();
}

function declarationExportWrapper(node: NativeQueryNode): NativeQueryNode | undefined {
  const wrapper = ancestor(node, "export_statement");
  if (!wrapper) return undefined;
  const declaration = field(wrapper, "declaration") ?? field(wrapper, "value");
  if (declaration === node) return wrapper;
  if (declaration?.type === "lexical_declaration" && ancestor(node, "lexical_declaration") === declaration) return wrapper;
  return undefined;
}

function normalizedTypeToken(source: Buffer, node: NativeQueryNode): string {
  return text(source, node).replace(/^\s*:\s*/u, "").trim();
}

function signatureOwner(node: NativeQueryNode): NativeQueryNode {
  const value = field(node, "value");
  return value?.type === "arrow_function" || value?.type === "function_expression" ? value : node;
}

function structuralSignature(source: Buffer, draft: SymbolDraft): string {
  const owner = signatureOwner(draft.node);
  const body = field(owner, "body");
  const value = field(draft.node, "value");
  let endByte = body?.startIndex ?? draft.node.endIndex;
  if (
    !body && value && owner === draft.node &&
    ["variable_declarator", "public_field_definition", "field_definition"].includes(draft.node.type)
  ) endByte = value.startIndex;
  let valuePrefix = "";
  if (owner !== draft.node) {
    valuePrefix = text(source, draft.node).slice(0, owner.startIndex - draft.node.startIndex);
  }
  // Short-circuit empty bodies before the fingerprint work: when the sliceable
  // region is empty there is nothing to sign, and the trailing trim/regex chain
  // would return "" anyway. Skip the wasted computation (cbm b9797ec — don't
  // compute a signature over nothing). Output is byte-identical to the fall-
  // through for empty regions; the dedup key is untouched.
  if (endByte <= owner.startIndex && valuePrefix === "") return "";
  const raw = `${valuePrefix}${source.subarray(owner.startIndex, endByte).toString("utf8")}`.trim();
  return raw.replace(/(?:=>|=|\{)\s*$/u, "").replace(/;\s*$/u, "").trim();
}

function signatureMaterial(source: Buffer, draft: SymbolDraft) {
  const owner = signatureOwner(draft.node);
  const callable = ["function", "method", "constructor"].includes(draft.kind);
  const elixirHead = owner.type === "call" && field(owner, "target") && ["def", "defp", "defmacro", "defmacrop"].includes(text(source, field(owner, "target")!))
    ? owner.namedChildren?.find((node) => node.type === "arguments")?.namedChildren?.find((node) => node.type === "call")
    : undefined;
  const parameters = callable ? field(elixirHead ?? owner, "parameters") ?? field(elixirHead ?? owner, "args") ?? field(elixirHead ?? owner, "patterns") ??
    (elixirHead ? elixirHead.namedChildren?.find((node) => node.type === "arguments") : undefined) ??
    (owner.type === "class_parameters" ? owner : undefined) ?? descendants(owner).find((node) =>
    ["formal_parameters", "formal_parameter_list", "function_value_parameters", "class_parameters", "parameter_clause", "expr_args", "patterns"].includes(node.type)
  ) : undefined;
  const parameterTypes = new Set(["parameter", "formal_parameter", "class_parameter", "required_parameter", "optional_formal_parameter"]);
  const parameterNodes = parameters
    ? ["expr_args", "arguments", "patterns"].includes(parameters.type)
      ? (parameters.namedChildren ?? [])
      : (parameters.namedChildren ?? []).filter((node) => parameterTypes.has(node.type))
    : callable ? (owner.namedChildren ?? []).filter((node) => parameterTypes.has(node.type)) : [];
  const typeTokens: string[] = [];
  for (const parameter of parameterNodes) {
    const typeNode = field(parameter, "type") ?? ["user_type", "type_identifier", "predefined_type", "nullable_type", "identifier"]
      .map((type) => parameter.namedChildren?.find((node) => node.type === type)).find((node): node is NativeQueryNode => Boolean(node));
    if (typeNode) typeTokens.push(normalizedTypeToken(source, typeNode));
  }
  const returnType = field(owner, "return_type") ?? field(owner, "returns") ?? field(draft.node, "type");
  if (returnType) typeTokens.push(normalizedTypeToken(source, returnType));
  if (draft.node.type === "type_alias_declaration") {
    const value = field(draft.node, "value");
    if (value) typeTokens.push(normalizedTypeToken(source, value));
  }
  const knownModifiers = new Set([
    "abstract", "async", "declare", "default", "export", "get", "override",
    "private", "protected", "public", "readonly", "set", "static",
  ]);
  const modifiers: string[] = [];
  let modifierOwner = draft.node;
  if (draft.node.type === "variable_declarator") {
    let current = draft.node.parent ?? undefined;
    while (current) {
      if (["field_declaration", "constant_declaration", "event_field_declaration"].includes(current.type)) {
        modifierOwner = current;
        break;
      }
      if (!["variable_declaration"].includes(current.type)) break;
      current = current.parent ?? undefined;
    }
  }
  const directChildren = owner === modifierOwner
    ? (modifierOwner.children ?? [])
    : [...(modifierOwner.children ?? []), ...(owner.children ?? [])];
  for (const child of directChildren) {
    if (knownModifiers.has(child.type)) modifiers.push(child.type);
    else if (child.type === "modifiers") {
      for (const modifier of child.children ?? []) {
        const value = knownModifiers.has(modifier.type) ? modifier.type : text(source, modifier).trim();
        if (knownModifiers.has(value)) modifiers.push(value);
      }
    }
    else if (child.type === "accessibility_modifier") {
      const value = text(source, child).trim();
      if (knownModifiers.has(value)) modifiers.push(value);
    } else {
      const value = text(source, child).trim();
      if (knownModifiers.has(value)) modifiers.push(value);
    }
  }
  const exportWrapper = declarationExportWrapper(draft.node);
  if (exportWrapper && !modifiers.includes("export")) modifiers.push("export");
  if (exportWrapper && text(source, exportWrapper).trimStart().startsWith("export default") && !modifiers.includes("default")) {
    modifiers.push("default");
  }
  if (draft.kind === "export") {
    if (!modifiers.includes("export")) modifiers.push("export");
    if (text(source, draft.node).trimStart().startsWith("export default") && !modifiers.includes("default")) modifiers.push("default");
  }
  return Object.freeze({
    arity: parameterNodes.length,
    typeTokens: Object.freeze(typeTokens),
    modifiers: Object.freeze(modifiers.sort()),
  });
}

function buildSymbols(
  captures: readonly NativeQueryCapture[],
  source: Buffer,
  index: SourceIndex,
  includeDocumentation: boolean,
  family: StructuralQueryPack["family"] = "typescript",
): readonly NormalizedStructuralSymbol[] {
  const drafts: SymbolDraft[] = [];
  for (const capture of captures) {
    if (!capture.name.startsWith("symbol.")) continue;
    if (capture.node.type === "property_signature" && capture.node.parent?.type !== "interface_body") continue;
    const kind = symbolKind(capture.name, source, capture.node);
    if (capture.node.type === "function_signature" && ancestor(capture.node, "method_signature")) continue;
    const name = symbolName(source, capture.node);
    if (!kind || !name) continue;
    drafts.push({ kind, name, node: capture.node, qualifiedName: name });
  }
  for (const capture of captures.filter((item) => item.name === "export.statement")) {
    const defaultExport = text(source, capture.node).trimStart().startsWith("export default");
    if (defaultExport) {
      drafts.push({ kind: "export", name: "default", node: capture.node, qualifiedName: "default" });
    }
    if (field(capture.node, "declaration") || field(capture.node, "value")) continue;
    const specifiers = descendants(capture.node).filter((node) => node.type === "export_specifier");
    const names = specifiers.map((specifier) => field(specifier, "alias") ?? field(specifier, "name")).filter((node): node is NativeQueryNode => Boolean(node));
    for (const nameNode of names) {
      const name = text(source, nameNode).normalize("NFC");
      drafts.push({ kind: "export", name, node: nameNode, qualifiedName: name });
    }
  }
  drafts.sort((left, right) =>
    left.node.startIndex - right.node.startIndex || right.node.endIndex - left.node.endIndex,
  );
  // Precompute each draft's byte range once. The wrapped capture node's
  // startIndex/endIndex are getter-backed byte-offset computations; resolving
  // them inside the O(drafts^2) parent scan re-runs that work on every
  // comparison. Containment is monotonic, so the precomputed byte ranges
  // identify the same smallest-enclosing parent.
  const draftRanges = drafts.map((draft) => ({ start: draft.node.startIndex, end: draft.node.endIndex }));
  for (let i = 0; i < drafts.length; i += 1) {
    const draft = drafts[i]!;
    const draftRange = draftRanges[i]!;
    let parentIndex = -1;
    for (let j = 0; j < drafts.length; j += 1) {
      if (j === i) continue;
      const candidate = drafts[j]!;
      if (candidate.kind === "export" || candidate.kind === "constructor") continue;
      const candidateRange = draftRanges[j]!;
      if (candidateRange.start <= draftRange.start && candidateRange.end >= draftRange.end) {
        if (parentIndex === -1 || candidateRange.end - candidateRange.start < draftRanges[parentIndex]!.end - draftRanges[parentIndex]!.start) {
          parentIndex = j;
        }
      }
    }
    draft.qualifiedName = parentIndex >= 0 ? `${drafts[parentIndex]!.qualifiedName}.${draft.name}` : draft.name;
  }
  // Precompute the documentation captures once; the per-draft filter below
  // would otherwise allocate + scan every capture for every symbol.
  const documentationCaptures = captures.filter((capture) => capture.name === "documentation");
  let symbols = drafts.map((draft) => {
    const nameNode = field(draft.node, "name") ?? field(draft.node, "property") ??
      (["pair", "block_mapping_pair", "flow_pair"].includes(draft.node.type) ? field(draft.node, "key") : undefined) ??
      (["atx_heading", "setext_heading"].includes(draft.node.type) ? field(draft.node, "heading_content") : undefined);
    const documentationStart = draft.node.parent?.type === "export_statement"
      ? draft.node.parent.startIndex
      : draft.node.type === "type_spec" && draft.node.parent?.type === "type_declaration"
        ? draft.node.parent.startIndex
      : draft.node.startIndex;
    const capturedDocumentation = documentationCaptures
      .find((capture) => {
        if (capture.node.startIndex >= draft.node.startIndex && capture.node.endIndex <= draft.node.endIndex) {
          return family === "python" && !captures.some((item) =>
            item.name.startsWith("symbol.") && item.node !== draft.node &&
            item.node.startIndex <= capture.node.startIndex && item.node.endIndex >= capture.node.endIndex
          );
        }
        if (capture.node.endIndex > documentationStart) return false;
        for (let offset = capture.node.endIndex; offset < documentationStart; offset += 1) {
          if (family === "elixir") {
            const chained = captures.find((item) => item.name === "documentation" && item.node.startIndex <= offset && item.node.endIndex > offset);
            if (chained) {
              offset = chained.node.endIndex - 1;
              continue;
            }
          }
          const byte = source[offset];
          if (byte !== 9 && byte !== 10 && byte !== 13 && byte !== 32) return false;
        }
        return true;
      });
    const documentation = includeDocumentation
      ? capturedDocumentation ? family === "elixir"
        ? documentationCaptures.filter((item) => item.node.startIndex >= capturedDocumentation.node.startIndex && item.node.endIndex <= documentationStart)
          .map((item) => text(source, item.node).trim()).join("\n")
        : text(source, capturedDocumentation.node).trim() : family === "typescript"
        ? leadingDocumentation(source, documentationStart)
        : undefined
      : undefined;
    const material = signatureMaterial(source, draft);
    const scriptingExport = family !== "typescript" && !draft.qualifiedName.includes(".") &&
      (family !== "java" || material.modifiers.includes("public"));
    return Object.freeze({
      kind: draft.kind,
      name: draft.name,
      qualifiedName: draft.qualifiedName,
      span: frozenSpan(index, draft.node.startIndex, draft.node.endIndex),
      ...(nameNode ? { selectionSpan: frozenSpan(index, nameNode.startIndex, nameNode.endIndex) } : {}),
      exported: scriptingExport || draft.kind === "export" || Boolean(declarationExportWrapper(draft.node)) || text(source, draft.node).trimStart().startsWith("export "),
      defaultExport: draft.name === "default" ||
        text(source, declarationExportWrapper(draft.node) ?? draft.node).trimStart().startsWith("export default"),
      ...(documentation ? { documentation } : {}),
      signature: structuralSignature(source, draft),
      signatureMaterial: material,
    } satisfies NormalizedStructuralSymbol);
  });
  if (["erlang", "clojure", "haskell"].includes(family ?? "")) {
    const module = symbols.find((symbol) => symbol.kind === "module");
    if (module) symbols = symbols.map((symbol) => symbol === module || symbol.qualifiedName.includes(".")
      ? symbol
      : Object.freeze({ ...symbol, qualifiedName: `${module.name}.${symbol.qualifiedName}` }));
  }
  if (family === "markdown") {
    const stack: { level: number; qualifiedName: string }[] = [];
    symbols = symbols.map((symbol, position) => {
      const draft = drafts[position]!;
      const marker = draft.node.children?.find((child) => /^(?:atx_h[1-6]_marker|setext_h[12]_underline)$/u.test(child.type));
      const match = marker?.type.match(/h([1-6])/u);
      const level = Number(match?.[1] ?? (marker?.type.includes("h2") ? 2 : 1));
      while (stack.length && stack.at(-1)!.level >= level) stack.pop();
      const qualifiedName = stack.length ? `${stack.at(-1)!.qualifiedName}.${symbol.name}` : symbol.name;
      stack.push({ level, qualifiedName });
      return Object.freeze({ ...symbol, qualifiedName });
    });
  }
  const seen = new Set<string>();
  return Object.freeze(symbols.filter((symbol) => {
    const key = family === "haskell"
      ? `${symbol.kind}\0${symbol.qualifiedName}`
      : `${symbol.kind}\0${symbol.qualifiedName}\0${symbol.span.startByte}\0${symbol.span.endByte}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

export type { SymbolDraft };
export { symbolKind, leadingDocumentation, declarationExportWrapper, normalizedTypeToken, signatureOwner, structuralSignature, signatureMaterial, buildSymbols };
