import type { NativeQueryNode } from "./grammar-loaders.js";
import { SourceIndex } from "./source-span.js";

function text(source: Buffer, node: NativeQueryNode): string {
  return source.subarray(node.startIndex, node.endIndex).toString("utf8");
}

function frozenSpan(index: SourceIndex, startByte: number, endByte: number) {
  const span = index.span(startByte, endByte);
  return Object.freeze({
    ...span,
    start: Object.freeze(span.start),
    end: Object.freeze(span.end),
  });
}

function field(node: NativeQueryNode, name: string): NativeQueryNode | null {
  return node.childForFieldName?.(name) ?? null;
}

function descendants(node: NativeQueryNode): readonly NativeQueryNode[] {
  const result: NativeQueryNode[] = [];
  const visit = (current: NativeQueryNode): void => {
    for (const child of current.namedChildren ?? []) {
      result.push(child);
      visit(child);
    }
  };
  visit(node);
  return result;
}

function symbolName(source: Buffer, node: NativeQueryNode): string | null {
  if (["pair", "block_mapping_pair", "flow_pair"].includes(node.type)) {
    const key = field(node, "key");
    return key ? unquote(text(source, key)).normalize("NFC") : null;
  }
  if (["atx_heading", "setext_heading"].includes(node.type)) {
    const content = field(node, "heading_content") ?? node.namedChildren?.find((child) => !child.type.includes("marker") && !child.type.includes("underline"));
    return content ? text(source, content).trim().normalize("NFC") : null;
  }
  const nameNode = field(node, "name") ?? field(node, "property") ?? field(node, "left");
  if (nameNode) {
    const raw = text(source, nameNode);
    return (raw.startsWith("#") ? `%23${raw.slice(1)}` : raw).normalize("NFC");
  }
  if (node.type === "call") {
    const target = field(node, "target");
    const targetText = target ? text(source, target) : "";
    if (["defmodule", "defprotocol", "def", "defp", "defmacro", "defmacrop"].includes(targetText)) {
      const argumentsNode = node.namedChildren?.find((child) => child.type === "arguments");
      const candidate = argumentsNode?.namedChildren?.[0];
      if (candidate) {
        const head = candidate.type === "call" ? field(candidate, "target") : candidate;
        if (head) return text(source, head).normalize("NFC");
      }
    }
  }
  if (node.type === "list_lit") {
    const values = (node.namedChildren ?? []).filter((child) => child.type !== "comment");
    return values[1] ? text(source, values[1]).normalize("NFC") : null;
  }
  if (["module_definition", "value_definition", "type_definition", "class_definition"].includes(node.type)) {
    const candidate = descendants(node).find((child) => [
      "module_name", "value_name", "type_constructor", "class_name",
    ].includes(child.type));
    if (candidate) return text(source, candidate).normalize("NFC");
  }
  if (node.type === "fun_decl") {
    const clause = descendants(node).find((child) => child.type === "function_clause");
    const nestedName = clause ? field(clause, "name") : null;
    if (nestedName) return text(source, nestedName).normalize("NFC");
  }
  if (node.type === "module" || node.type === "header") {
    const moduleNode = node.type === "module" ? node : descendants(node).find((child) => child.type === "module");
    if (moduleNode) return text(source, moduleNode).normalize("NFC");
  }
  if (["function_definition", "type_definition"].includes(node.type)) {
    let declarator = field(node, "declarator");
    while (declarator) {
      if (["identifier", "field_identifier", "type_identifier"].includes(declarator.type)) {
        return text(source, declarator).normalize("NFC");
      }
      declarator = field(declarator, "declarator");
    }
  }
  if (node.type === "variable_declaration") {
    const identifier = node.namedChildren?.find((child) => child.type === "identifier");
    return identifier ? text(source, identifier).normalize("NFC") : null;
  }
  if (node.type === "class_declaration" && text(source, node).trimStart().startsWith("enum ")) return "enum";
  if (node.type === "init_declaration") return "init";
  if (node.type === "secondary_constructor") return "constructor";
  if (["primary_constructor", "class_parameters"].includes(node.type)) {
    const owner = ancestor(node, "class_declaration") ?? ancestor(node, "class_definition");
    const ownerName = owner ? field(owner, "name") : null;
    return ownerName ? text(source, ownerName).normalize("NFC") : "constructor";
  }
  if (node.type === "function_definition" && symbolName(source, node) === "this") return "constructor";
  if (["property_declaration", "field_declaration", "val_definition", "var_definition", "initialized_identifier", "initialized_variable_definition", "class_parameter"].includes(node.type)) {
    const identifier = descendants(node).find((child) => ["variable_declarator", "initialized_identifier", "initialized_variable_definition"].includes(child.type)) ??
      descendants(node).find((child) => ["simple_identifier", "identifier"].includes(child.type));
    if (identifier) {
      const nested = field(identifier, "name") ?? identifier.namedChildren?.find((child) => ["identifier", "simple_identifier"].includes(child.type));
      return text(source, nested ?? identifier).normalize("NFC");
    }
  }
  if (["function_signature", "method_signature"].includes(node.type)) {
    const nestedName = descendants(node).map((child) => field(child, "name")).find((child): child is NativeQueryNode => Boolean(child));
    if (nestedName) return text(source, nestedName).normalize("NFC");
  }
  if (node.type === "type_parameter") {
    const identifier = node.namedChildren?.find((child) => child.type === "type_identifier" || child.type === "identifier");
    return identifier ? text(source, identifier).normalize("NFC") : null;
  }
  if (node.type === "export_statement") {
    const declaration = field(node, "declaration") ?? node.namedChildren?.find((child) =>
      child.type.endsWith("_declaration") || child.type === "lexical_declaration",
    );
    const nestedName = declaration ? field(declaration, "name") : null;
    if (nestedName) return text(source, nestedName).normalize("NFC");
    const value = text(source, node);
    return value.startsWith("export default") ? "default" : null;
  }
  return null;
}

function ancestor(node: NativeQueryNode | null | undefined, type: string): NativeQueryNode | undefined {
  let current = node?.parent ?? undefined;
  while (current) {
    if (current.type === type) return current;
    current = current.parent ?? undefined;
  }
  return undefined;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && "'\"`".includes(trimmed[0]!) && trimmed.at(-1) === trimmed[0]) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export { text, frozenSpan, field, descendants, symbolName, ancestor, unquote };
