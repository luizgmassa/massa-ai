import type { StructuralQueryPack } from "../query-pack.js";

export const JAVA_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["java"]), family: "java", querySources: Object.freeze([`
    (class_declaration) @symbol.class
    (interface_declaration) @symbol.interface
    (enum_declaration) @symbol.enum
    (record_declaration) @symbol.class
    (method_declaration) @symbol.method
    (constructor_declaration) @symbol.constructor
    (compact_constructor_declaration) @symbol.constructor
    (field_declaration declarator: (variable_declarator) @symbol.field)
    (import_declaration) @import.java
    (method_invocation) @edge.call
    (object_creation_expression) @edge.call
    (superclass (type_identifier) @edge.extend)
    (super_interfaces (type_list (type_identifier) @edge.implement))
    (formal_parameter (type_identifier) @edge.type_ref)
    (line_comment) @documentation
    (block_comment) @documentation
  `]),
});

export const KOTLIN_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["kotlin", "kotlin-script"]), family: "kotlin", querySources: Object.freeze([`
    (class_declaration) @symbol.class
    (object_declaration) @symbol.class
    (function_declaration) @symbol.function
    (property_declaration) @symbol.property
    (class_parameter) @symbol.property
    (secondary_constructor) @symbol.constructor
    (primary_constructor) @symbol.constructor
    (import) @import.kotlin
    (call_expression) @edge.call
    (constructor_invocation) @edge.call
    (delegation_specifier (user_type) @edge.extend)
    (parameter (user_type) @edge.type_ref)
    (line_comment) @documentation
    (block_comment) @documentation
  `]),
});

export const SCALA_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["scala"]), family: "scala", querySources: Object.freeze([`
    (class_definition) @symbol.class
    (object_definition) @symbol.class
    (trait_definition) @symbol.trait
    (enum_definition) @symbol.enum
    (function_definition) @symbol.function
    (function_declaration) @symbol.function
    (val_definition) @symbol.property
    (var_definition) @symbol.property
    (class_parameter) @symbol.property
    (class_parameters) @symbol.constructor
    (type_definition) @symbol.type
    (import_declaration) @import.scala
    (call_expression) @edge.call
    (extends_clause (type_identifier) @edge.extend)
    (parameter type: (type_identifier) @edge.type_ref)
    (comment) @documentation
    (block_comment) @documentation
  `]),
});

export const CSHARP_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["csharp"]), family: "csharp", querySources: Object.freeze([`
    (class_declaration) @symbol.class
    (interface_declaration) @symbol.interface
    (enum_declaration) @symbol.enum
    (struct_declaration) @symbol.class
    (method_declaration) @symbol.method
    (constructor_declaration) @symbol.constructor
    (property_declaration) @symbol.property
    (field_declaration (variable_declaration (variable_declarator) @symbol.field))
    (using_directive) @import.csharp
    (invocation_expression) @edge.call
    (object_creation_expression) @edge.call
    (base_list (identifier) @edge.extend)
    (parameter type: (identifier) @edge.type_ref)
    (comment) @documentation
  `]),
});

export const SWIFT_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["swift"]), family: "swift", querySources: Object.freeze([`
    (class_declaration) @symbol.class
    (protocol_declaration) @symbol.interface
    (function_declaration) @symbol.function
    (init_declaration) @symbol.constructor
    (property_declaration) @symbol.property
    (import_declaration) @import.swift
    (call_expression) @edge.call
    (inheritance_specifier (user_type) @edge.extend)
    (parameter (user_type) @edge.type_ref)
    (comment) @documentation
  `]),
});

export const DART_QUERY_PACK: StructuralQueryPack = Object.freeze({
  version: "1.0.0", dialects: Object.freeze(["dart"]), family: "dart", querySources: Object.freeze([`
    (class_definition) @symbol.class
    (enum_declaration) @symbol.enum
    (mixin_declaration) @symbol.trait
    (extension_declaration) @symbol.class
    (function_signature) @symbol.function
    (method_signature) @symbol.method
    (constructor_signature) @symbol.constructor
    (initialized_identifier) @symbol.field
    (import_or_export) @import.dart
    (selector) @edge.call
    (superclass (type_identifier) @edge.extend)
    (interfaces (type_identifier) @edge.implement)
    (formal_parameter (type_identifier) @edge.type_ref)
    (comment) @documentation
    (documentation_comment) @documentation
  `]),
});

export const MANAGED_QUERY_PACKS = Object.freeze([
  JAVA_QUERY_PACK, KOTLIN_QUERY_PACK, SCALA_QUERY_PACK, CSHARP_QUERY_PACK, SWIFT_QUERY_PACK, DART_QUERY_PACK,
]);
