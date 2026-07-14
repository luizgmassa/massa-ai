import type { StructuralQueryPack } from "../query-pack.js";

export const PYTHON_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["python"]), family: "python", querySources: Object.freeze([`
    (class_definition) @symbol.class
    (function_definition) @symbol.function
    (import_statement) @import.python
    (import_from_statement) @import.python
    (call) @edge.call
    (class_definition superclasses: (argument_list (identifier) @edge.extend))
    (type (identifier) @edge.type_ref)
    (expression_statement (string) @documentation)
  `]),
});

export const RUBY_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["ruby"]), family: "ruby", querySources: Object.freeze([`
    (class) @symbol.class
    (module) @symbol.module
    (method) @symbol.method
    (singleton_method) @symbol.method
    (call) @edge.call
    (class superclass: (superclass (constant) @edge.extend))
    (comment) @documentation
  `]),
});

export const PHP_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["php"]), family: "php", querySources: Object.freeze([`
    (namespace_definition) @symbol.namespace
    (class_declaration) @symbol.class
    (interface_declaration) @symbol.interface
    (trait_declaration) @symbol.trait
    (enum_declaration) @symbol.enum
    (function_definition) @symbol.function
    (method_declaration) @symbol.method
    (function_call_expression) @edge.call
    (member_call_expression) @edge.call
    (scoped_call_expression) @edge.call
    (namespace_use_declaration) @import.php
    (base_clause (name) @edge.extend)
    (class_interface_clause (name) @edge.implement)
    (named_type (name) @edge.type_ref)
    (comment) @documentation
  `]),
});

export const LUA_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["lua-luajit"]), family: "lua", querySources: Object.freeze([`
    (function_declaration) @symbol.function
    (function_call) @edge.call
    (comment) @documentation
  `]),
});

export const SCRIPTING_QUERY_PACKS = Object.freeze([
  PYTHON_QUERY_PACK, RUBY_QUERY_PACK, PHP_QUERY_PACK, LUA_QUERY_PACK,
]);
