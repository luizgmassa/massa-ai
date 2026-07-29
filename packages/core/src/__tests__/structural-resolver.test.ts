import { describe, expect, test } from "bun:test";
import { describeNative } from "./_helpers/native-skip.js";
import {
  StructuralResolverRegistry,
  StructuralResolverSession,
  StructuralFqnRegistry,
  SCRIPTING_LANGUAGE_RESOLVER,
  SYSTEMS_LANGUAGE_RESOLVER,
  MANAGED_LANGUAGE_RESOLVER,
  FUNCTIONAL_LANGUAGE_RESOLVER,
  DATA_DOCUMENT_LANGUAGE_RESOLVER,
  TYPESCRIPT_LANGUAGE_RESOLVER,
  buildStructuralResolverDefinitions,
  type NormalizedStructuralImport,
  type NormalizedStructuralSymbol,
  type StructuralIdentityInput,
  type StructuralResolverDefinition,
  type StructuralResolverFile,
  type StructuralReference,
  type SourceSpan,
} from "../services/index.js";
import { StructuralRuntime } from "../services/structural/structural-runtime.js";
import { loadNativeGrammarSet } from "../services/structural/grammar-loaders.js";

const SPAN = Object.freeze({
  startByte: 0,
  endByte: 1,
  start: Object.freeze({ row: 0, column: 0 }),
  end: Object.freeze({ row: 0, column: 1 }),
});

function identity(
  file: string,
  name: string,
  overrides: Partial<StructuralIdentityInput> = {},
): StructuralIdentityInput {
  return {
    file,
    name,
    language: "typescript",
    dialect: "typescript",
    qualifiedName: name,
    kind: "function",
    arity: 0,
    typeTokens: [],
    modifiers: [],
    scope: "top_level",
    overload: "unique",
    ...overrides,
  };
}

function definition(
  file: string,
  name: string,
  options: Partial<StructuralResolverDefinition> & { identity?: Partial<StructuralIdentityInput> } = {},
): StructuralResolverDefinition {
  return {
    identity: identity(file, name, options.identity),
    exported: options.exported ?? true,
    ...(options.defaultExport === undefined ? {} : { defaultExport: options.defaultExport }),
  };
}

function imported(
  specifier: string,
  bindings: readonly { imported: string; local: string; typeOnly?: boolean }[],
  options: { form?: NormalizedStructuralImport["form"]; typeOnly?: boolean } = {},
): NormalizedStructuralImport {
  const normalized = bindings.map((binding) => Object.freeze({
    imported: binding.imported,
    local: binding.local,
    typeOnly: binding.typeOnly ?? false,
  }));
  return Object.freeze({
    form: options.form ?? "esm_import",
    specifier,
    span: SPAN,
    bindings: Object.freeze(normalized),
    names: Object.freeze(normalized.map((binding) => binding.local)),
    typeOnly: options.typeOnly ?? false,
  });
}

function file(imports: readonly NormalizedStructuralImport[] = []): StructuralResolverFile {
  return Object.freeze({
    file: "src/main.ts",
    dialect: "typescript",
    resolverVersion: "1.0.0",
    imports: Object.freeze(imports),
  });
}

function reference(
  name: string,
  options: { qualifier?: string; kind?: StructuralReference["kind"]; lexicalScope?: string } = {},
): StructuralReference {
  return Object.freeze({
    kind: options.kind ?? "call",
    span: SPAN,
    target: Object.freeze({
      status: "unresolved",
      name,
      ...(options.qualifier ? { qualifier: options.qualifier } : {}),
    }),
    ...(options.lexicalScope ? { lexicalScope: options.lexicalScope } : {}),
  });
}

function symbol(
  name: string,
  qualifiedName = name,
  overrides: Partial<NormalizedStructuralSymbol> = {},
): NormalizedStructuralSymbol {
  return Object.freeze({
    kind: "function",
    name,
    qualifiedName,
    span: SPAN,
    exported: true,
    defaultExport: false,
    signatureMaterial: Object.freeze({ arity: 0, typeTokens: Object.freeze([]), modifiers: Object.freeze([]) }),
    ...overrides,
  });
}

const BUILD = Object.freeze({
  knownFiles: Object.freeze(["src/main.ts", "src/lib.ts", "src/pkg/index.ts", "shared/util.ts"]),
  pathAliases: Object.freeze([{ pattern: "@shared/*", targets: Object.freeze(["shared/*"]) }]),
});

describe("structural resolver registry", () => {
  test("resolves Vue embedded TS/JS imports and excludes foreign definitions", () => {
    const registry = new StructuralResolverRegistry([DATA_DOCUMENT_LANGUAGE_RESOLVER]);
    expect(registry.requireDialect("sfc", "1.0.0")).toBe(DATA_DOCUMENT_LANGUAGE_RESOLVER);
    const current = Object.freeze({
      file: "src/View.vue", dialect: "sfc", resolverVersion: "1.0.0",
      imports: Object.freeze([imported("./dep", [{ imported: "run", local: "execute" }])]),
    });
    const definitions = [
      definition("src/dep.ts", "run"),
      definition("src/foreign.py", "foreign", { identity: { language: "Python", dialect: "python" } }),
    ];
    expect(DATA_DOCUMENT_LANGUAGE_RESOLVER.resolve(current, reference("execute"), definitions, { knownFiles: ["src/View.vue", "src/dep.ts", "src/foreign.py"] }))
      .toMatchObject({ status: "resolved", source: "import" });
    expect(DATA_DOCUMENT_LANGUAGE_RESOLVER.resolve(current, reference("foreign"), definitions, { knownFiles: ["src/View.vue", "src/dep.ts", "src/foreign.py"] }))
      .toEqual({ status: "unresolved", name: "foreign" });
  });

  test("registers all TS/JS family dialects and rejects duplicate ownership", () => {
    const registry = new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]);
    for (const dialect of ["typescript", "tsx", "javascript", "jsx"]) {
      expect(registry.requireDialect(dialect, "1.0.0")).toBe(TYPESCRIPT_LANGUAGE_RESOLVER);
    }
    expect(() => registry.register(TYPESCRIPT_LANGUAGE_RESOLVER)).toThrow("duplicate");
    expect(() => registry.requireDialect("typescript", "2.0.0")).toThrow("missing");
    const nextVersion = { ...TYPESCRIPT_LANGUAGE_RESOLVER, version: "2.0.0" };
    registry.register(nextVersion);
    expect(registry.requireDialect("typescript", "2.0.0")).toBe(nextVersion);
  });

  test("rejects conflicting multi-dialect registration atomically", () => {
    const registry = new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]);
    const conflicting = {
      ...TYPESCRIPT_LANGUAGE_RESOLVER,
      dialects: ["python", "typescript"],
    };
    expect(() => registry.register(conflicting)).toThrow("duplicate");
    expect(registry.forDialect("python", "1.0.0")).toBeUndefined();
  });
});

describeNative("scripting structural resolver", () => {
  test("registers every scripting dialect and resolves same-file, alias, global, ambiguity, and unresolved cases", () => {
    const registry = new StructuralResolverRegistry([SCRIPTING_LANGUAGE_RESOLVER]);
    for (const dialect of ["python", "ruby", "php", "lua-luajit"]) {
      expect(registry.requireDialect(dialect, "1.0.0")).toBe(SCRIPTING_LANGUAGE_RESOLVER);
    }
    const definitions = [
      definition("src/main.py", "local", { identity: { language: "Python", dialect: "python" } }),
      definition("src/lib.py", "run", { identity: { language: "Python", dialect: "python" } }),
      definition("src/a.py", "shared", { identity: { language: "Python", dialect: "python" } }),
      definition("src/b.py", "shared", { identity: { language: "Python", dialect: "python" } }),
      definition("src/lib.ts", "run", { identity: { language: "TypeScript", dialect: "typescript" } }),
    ];
    const current = Object.freeze({
      file: "src/main.py", dialect: "python", resolverVersion: "1.0.0",
      imports: Object.freeze([imported("./lib", [{ imported: "run", local: "execute" }], { form: "python_import" })]),
    });
    const build = { knownFiles: ["src/main.py", "src/lib.py", "src/lib.ts", "src/a.py", "src/b.py"] };
    expect(SCRIPTING_LANGUAGE_RESOLVER.resolve(current, reference("local"), definitions, build)).toMatchObject({ status: "resolved", source: "same_file" });
    expect(SCRIPTING_LANGUAGE_RESOLVER.resolve(current, reference("execute"), definitions, build)).toMatchObject({ status: "resolved", source: "import" });
    expect(SCRIPTING_LANGUAGE_RESOLVER.resolve(current, reference("run"), definitions, build)).toMatchObject({ status: "resolved", source: "global" });
    expect(SCRIPTING_LANGUAGE_RESOLVER.resolve(current, reference("shared"), definitions, build)).toMatchObject({ status: "ambiguous" });
    expect(SCRIPTING_LANGUAGE_RESOLVER.resolve(current, reference("missing"), definitions, build)).toEqual({ status: "unresolved", name: "missing" });
    expect(SCRIPTING_LANGUAGE_RESOLVER.resolve(
      { ...current, imports: [imported("./typescript_only", [{ imported: "run", local: "foreign" }], { form: "python_import" })] },
      reference("foreign"),
      [definition("src/typescript_only.ts", "run")],
      { knownFiles: ["src/main.py", "src/typescript_only.ts"] },
    )).toEqual({ status: "unresolved", name: "foreign" });
    expect(TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./python_only", [{ imported: "run", local: "foreign" }])]),
      reference("foreign"),
      [definition("src/python_only.py", "run", { identity: { language: "Python", dialect: "python" } })],
      { knownFiles: ["src/main.ts", "src/python_only.py"] },
    )).toEqual({ status: "unresolved", name: "foreign" });
  });
});

describeNative("systems structural resolver", () => {
  test("resolves exact alias records produced by the native Rust grammar", async () => {
    const grammarSet = await loadNativeGrammarSet([{ packageName: "tree-sitter-rust", version: "0.24.0" }]);
    const outcome = await new StructuralRuntime({ grammarSet: () => grammarSet }).parse({
      extension: ".rs",
      source: Buffer.from("use crate::base::{Base as Root, helper, self as base_mod, *};\nfn run() { Root(); helper(); Other(); base_mod::Nested(); }"),
    });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.structure.imports).toHaveLength(1);
    const current = { file: "src/main.rs", dialect: "rust", resolverVersion: "1.0.0", imports: outcome.structure.imports };
    const definitions = [
      definition("src/base.rs", "Base", { identity: { language: "Rust", dialect: "rust" } }),
      definition("src/base.rs", "helper", { identity: { language: "Rust", dialect: "rust" } }),
      definition("src/base.rs", "Other", { identity: { language: "Rust", dialect: "rust" } }),
      definition("src/base.rs", "Nested", { identity: { language: "Rust", dialect: "rust" } }),
    ];
    const build = { knownFiles: ["src/main.rs", "src/base.rs"] };
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(current, reference("Root"), definitions, build))
      .toMatchObject({ status: "resolved", fqn: "src/base.rs#Base", source: "import" });
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(current, reference("helper"), definitions, build))
      .toMatchObject({ status: "resolved", fqn: "src/base.rs#helper", source: "import" });
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(current, reference("Other"), definitions, build))
      .toMatchObject({ status: "resolved", fqn: "src/base.rs#Other", source: "import" });
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(current, reference("Nested", { qualifier: "base_mod" }), definitions, build))
      .toMatchObject({ status: "resolved", fqn: "src/base.rs#Nested", source: "import" });
  });

  test("isolates dialects while resolving imports, globals, ambiguity, and unresolved targets", () => {
    const registry = new StructuralResolverRegistry([SYSTEMS_LANGUAGE_RESOLVER]);
    for (const dialect of ["c", "header-default-c", "cpp", "header", "header-cpp", "go", "rust", "zig"]) {
      expect(registry.requireDialect(dialect, "1.0.0")).toBe(SYSTEMS_LANGUAGE_RESOLVER);
    }
    const current = { file: "src/main.go", dialect: "go", resolverVersion: "1.0.0", imports: [
      imported("./lib", [{ imported: "run", local: "execute" }], { form: "go_import" }),
    ] };
    const definitions = [
      definition("src/lib.go", "run", { identity: { language: "Go", dialect: "go" } }),
      definition("src/a.go", "shared", { identity: { language: "Go", dialect: "go" } }),
      definition("src/b.go", "shared", { identity: { language: "Go", dialect: "go" } }),
      definition("src/lib.rs", "run", { identity: { language: "Rust", dialect: "rust" } }),
    ];
    const build = { knownFiles: ["src/main.go", "src/lib.go", "src/a.go", "src/b.go", "src/lib.rs"] };
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(current, reference("execute"), definitions, build)).toMatchObject({ status: "resolved", source: "import" });
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(current, reference("run"), definitions, build)).toMatchObject({ status: "resolved", source: "global" });
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(current, reference("shared"), definitions, build)).toMatchObject({ status: "ambiguous" });
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(current, reference("missing"), definitions, build)).toEqual({ status: "unresolved", name: "missing" });
  });

  test("Rust self and super use-path specifiers resolve to relative paths", () => {
    // Covers systems.ts lines 30-31: self/ and super/ specifier rewriting.
    // `self/helper` → `./helper` (same directory), `super/helper` → `../helper` (parent directory).
    const selfSlashFile = Object.freeze({
      file: "src/main.rs", dialect: "rust", resolverVersion: "1.0.0",
      imports: Object.freeze([imported("self/helper", [{ imported: "helper", local: "helper" }], { form: "rust_use" })]),
    });
    const superSlashFile = Object.freeze({
      file: "src/sub/main.rs", dialect: "rust", resolverVersion: "1.0.0",
      imports: Object.freeze([imported("super/helper", [{ imported: "helper", local: "helper" }], { form: "rust_use" })]),
    });
    const selfBareFile = Object.freeze({
      file: "src/main.rs", dialect: "rust", resolverVersion: "1.0.0",
      imports: Object.freeze([imported("self", [{ imported: "helper", local: "helper" }], { form: "rust_use" })]),
    });
    const superBareFile = Object.freeze({
      file: "src/sub/main.rs", dialect: "rust", resolverVersion: "1.0.0",
      imports: Object.freeze([imported("super", [{ imported: "helper", local: "helper" }], { form: "rust_use" })]),
    });
    const definitions = [
      definition("src/helper.rs", "helper", { identity: { language: "Rust", dialect: "rust" } }),
    ];
    const build = { knownFiles: ["src/main.rs", "src/sub/main.rs", "src/helper.rs"] };
    // self/helper → ./helper → src/helper.rs
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(selfSlashFile, reference("helper"), definitions, build)).toMatchObject({ status: "resolved", fqn: "src/helper.rs#helper", source: "import" });
    // super/helper → ../helper → src/helper.rs (from src/sub/main.rs)
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(superSlashFile, reference("helper"), definitions, build)).toMatchObject({ status: "resolved", fqn: "src/helper.rs#helper", source: "import" });
    // self → ./ → current directory (not a file) → unresolved (covers the bare branch)
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(selfBareFile, reference("helper"), definitions, build)).toMatchObject({ status: "unresolved" });
    // super → ../ → parent directory (not a file) → unresolved (covers the bare branch)
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(superBareFile, reference("helper"), definitions, build)).toMatchObject({ status: "unresolved" });
  });

  test("Rust crate use-path specifier resolves to src root when file is under src/", () => {
    // Covers systems.ts lines 27-29: crate/ specifier rewriting.
    // `crate/helper` from src/main.rs → ./helper → src/helper.rs (crate root = src)
    const crateSlashFile = Object.freeze({
      file: "src/main.rs", dialect: "rust", resolverVersion: "1.0.0",
      imports: Object.freeze([imported("crate/helper", [{ imported: "helper", local: "helper" }], { form: "rust_use" })]),
    });
    const crateBareFile = Object.freeze({
      file: "src/main.rs", dialect: "rust", resolverVersion: "1.0.0",
      imports: Object.freeze([imported("crate", [{ imported: "helper", local: "helper" }], { form: "rust_use" })]),
    });
    const definitions = [
      definition("src/helper.rs", "helper", { identity: { language: "Rust", dialect: "rust" } }),
    ];
    const build = { knownFiles: ["src/main.rs", "src/helper.rs"] };
    // crate/helper → ./helper → src/helper.rs
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(crateSlashFile, reference("helper"), definitions, build)).toMatchObject({ status: "resolved", fqn: "src/helper.rs#helper", source: "import" });
    // crate → ./ → src/ (directory, not a file) → unresolved (covers the bare branch)
    expect(SYSTEMS_LANGUAGE_RESOLVER.resolve(crateBareFile, reference("helper"), definitions, build)).toMatchObject({ status: "unresolved" });
  });
});

describeNative("managed structural resolver", () => {
  test("resolves grammar-derived imports while isolating dialects and non-path modules", async () => {
    const grammarSet = await loadNativeGrammarSet([{ packageName: "tree-sitter-java", version: "0.23.5" }]);
    const outcome = await new StructuralRuntime({ grammarSet: () => grammarSet }).parse({
      extension: ".java", source: Buffer.from("import a.b.Base; class Main { void run(){ Base(); } }"),
    });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    const current = { file: "src/Main.java", dialect: "java", resolverVersion: "1.0.0", imports: outcome.structure.imports };
    const definitions = [
      definition("a/b/Base.java", "Base", { identity: { language: "Java", dialect: "java" } }),
      definition("src/Other.java", "shared", { identity: { language: "Java", dialect: "java" } }),
      definition("src/Again.java", "shared", { identity: { language: "Java", dialect: "java" } }),
      definition("a/b/Base.kt", "Base", { identity: { language: "Kotlin", dialect: "kotlin" } }),
    ];
    const build = { knownFiles: ["src/Main.java", "a/b/Base.java", "a/b/Base.kt", "src/Other.java", "src/Again.java"] };
    expect(MANAGED_LANGUAGE_RESOLVER.resolve(current, reference("Base"), definitions, build))
      .toMatchObject({ status: "resolved", fqn: "a/b/Base.java#Base", source: "import" });
    expect(MANAGED_LANGUAGE_RESOLVER.resolve(current, reference("shared"), definitions, build)).toMatchObject({ status: "ambiguous" });
    expect(MANAGED_LANGUAGE_RESOLVER.resolve(current, reference("missing"), definitions, build)).toEqual({ status: "unresolved", name: "missing" });
    const staticOutcome = await new StructuralRuntime({ grammarSet: () => grammarSet }).parse({
      extension: ".java", source: Buffer.from("import static a.b.Util.run; import static a.b.Util.VALUE; import static a.b.Util.SECRET; import static a.b.Util.*; class Main {}"),
    });
    const staticProvider = await new StructuralRuntime({ grammarSet: () => grammarSet }).parse({
      extension: ".java",
      source: Buffer.from("package a.b; public class Util { public static int VALUE; private static int SECRET; public static void run() {} public static void other() {} private static void hidden() {} }")
    });
    expect(staticOutcome.status).toBe("ok");
    expect(staticProvider.status).toBe("ok");
    if (staticOutcome.status === "ok" && staticProvider.status === "ok") {
      const staticFile = { file: "src/Main.java", dialect: "java", resolverVersion: "1.0.0", imports: staticOutcome.structure.imports };
      const staticDefinitions = buildStructuralResolverDefinitions([{
        file: "a/b/Util.java", language: "Java", dialect: "java", resolverVersion: "1.0.0",
        structure: staticProvider.structure,
      }]);
      const staticBuild = { knownFiles: ["src/Main.java", "a/b/Util.java"] };
      expect(staticDefinitions.find((item) => item.identity.qualifiedName === "Util.run")).toMatchObject({ exported: true });
      expect(staticDefinitions.find((item) => item.identity.qualifiedName === "Util.hidden")).toMatchObject({ exported: false });
      expect(staticDefinitions.find((item) => item.identity.qualifiedName === "Util.VALUE")).toMatchObject({
        exported: true, identity: { modifiers: ["public", "static"] },
      });
      expect(staticDefinitions.find((item) => item.identity.qualifiedName === "Util.SECRET")).toMatchObject({ exported: false });
      expect(MANAGED_LANGUAGE_RESOLVER.resolve(staticFile, reference("run"), staticDefinitions, staticBuild)).toMatchObject({ status: "resolved", fqn: expect.stringContaining("a/b/Util.java#Util.run"), source: "import" });
      expect(MANAGED_LANGUAGE_RESOLVER.resolve(staticFile, reference("other"), staticDefinitions, staticBuild)).toMatchObject({ status: "resolved", fqn: expect.stringContaining("a/b/Util.java#Util.other"), source: "import" });
      expect(MANAGED_LANGUAGE_RESOLVER.resolve(staticFile, reference("VALUE"), staticDefinitions, staticBuild)).toMatchObject({ status: "resolved", fqn: expect.stringContaining("a/b/Util.java#Util.VALUE"), source: "import" });
      expect(MANAGED_LANGUAGE_RESOLVER.resolve(staticFile, reference("SECRET"), staticDefinitions, staticBuild)).toEqual({ status: "unresolved", name: "SECRET" });
      expect(MANAGED_LANGUAGE_RESOLVER.resolve(staticFile, reference("hidden"), staticDefinitions, staticBuild)).toEqual({ status: "unresolved", name: "hidden" });
    }
    const nestedOutcome = await new StructuralRuntime({ grammarSet: () => grammarSet }).parse({
      extension: ".java", source: Buffer.from("import a.b.Outer.Inner; class Main {}"),
    });
    const nestedProvider = await new StructuralRuntime({ grammarSet: () => grammarSet }).parse({
      extension: ".java", source: Buffer.from("package a.b; public class Outer { public static class Inner {} private static class Hidden {} }")
    });
    expect(nestedOutcome.status).toBe("ok");
    expect(nestedProvider.status).toBe("ok");
    if (nestedOutcome.status === "ok" && nestedProvider.status === "ok") {
      const nestedDefinitions = buildStructuralResolverDefinitions([{
        file: "a/b/Outer.java", language: "Java", dialect: "java", resolverVersion: "1.0.0",
        structure: nestedProvider.structure,
      }]);
      expect(nestedDefinitions.find((item) => item.identity.qualifiedName === "Outer.Inner")).toMatchObject({ exported: true });
      expect(nestedDefinitions.find((item) => item.identity.qualifiedName === "Outer.Hidden")).toMatchObject({ exported: false });
      expect(MANAGED_LANGUAGE_RESOLVER.resolve(
        { file: "src/Main.java", dialect: "java", resolverVersion: "1.0.0", imports: nestedOutcome.structure.imports },
        reference("Inner"), nestedDefinitions,
        { knownFiles: ["src/Main.java", "a/b/Outer.java"] },
      )).toMatchObject({ status: "resolved", fqn: expect.stringContaining("a/b/Outer.java#Outer.Inner"), source: "import" });
    }
    const kotlinGrammars = await loadNativeGrammarSet([{ packageName: "@tree-sitter-grammars/tree-sitter-kotlin", version: "1.1.0" }]);
    const ktsOutcome = await new StructuralRuntime({ grammarSet: () => kotlinGrammars }).parse({
      extension: ".kts", source: Buffer.from("import a.b.Base\nBase()"),
    });
    expect(ktsOutcome.status).toBe("ok");
    if (ktsOutcome.status === "ok") {
      const kotlinDefinitions = [
        definition("a/b/Base.kt", "Base", { identity: { language: "Kotlin", dialect: "kotlin", kind: "class" } }),
        definition("a/b/Base.java", "Base", { identity: { language: "Java", dialect: "java", kind: "class" } }),
      ];
      expect(MANAGED_LANGUAGE_RESOLVER.resolve(
        { file: "src/main.kts", dialect: "kotlin-script", resolverVersion: "1.0.0", imports: ktsOutcome.structure.imports },
        reference("Base"), kotlinDefinitions, { knownFiles: ["src/main.kts", "a/b/Base.kt", "a/b/Base.java"] },
      )).toMatchObject({ status: "resolved", fqn: "a/b/Base.kt#Base", source: "import" });
      expect(MANAGED_LANGUAGE_RESOLVER.resolve(
        { file: "src/Main.kt", dialect: "kotlin", resolverVersion: "1.0.0", imports: [imported("a/b/Script", [{ imported: "Script", local: "Script" }], { form: "kotlin_import" })] },
        reference("Script"), [definition("a/b/Script.kts", "Script", { identity: { language: "Kotlin", dialect: "kotlin-script" } })],
        { knownFiles: ["src/Main.kt", "a/b/Script.kts"] },
      )).toMatchObject({ status: "resolved", fqn: "a/b/Script.kts#Script", source: "import" });
    }
    const dartGrammars = await loadNativeGrammarSet([{ packageName: "tree-sitter-dart", version: "github:UserNobody14/tree-sitter-dart#be07cf7118d3ba06236a3f19541685a68209934" }]);
    const dartOutcome = await new StructuralRuntime({ grammarSet: () => dartGrammars }).parse({
      extension: ".dart", source: Buffer.from('import "base.dart"; void main() { Base(); }'),
    });
    expect(dartOutcome.status).toBe("ok");
    if (dartOutcome.status === "ok") {
      const dartFile = { file: "src/main.dart", dialect: "dart", resolverVersion: "1.0.0", imports: dartOutcome.structure.imports };
      const dartDefinitions = [
        definition("src/base.dart", "Base", { identity: { language: "Dart", dialect: "dart" } }),
        definition("src/unrelated.dart", "Base", { identity: { language: "Dart", dialect: "dart" } }),
      ];
      expect(MANAGED_LANGUAGE_RESOLVER.resolve(dartFile, reference("Base"), dartDefinitions, { knownFiles: ["src/main.dart", "src/base.dart", "src/unrelated.dart"] }))
        .toMatchObject({ status: "resolved", fqn: "src/base.dart#Base", source: "import" });
    }
    expect(MANAGED_LANGUAGE_RESOLVER.resolve(
      { file: "src/Main.cs", dialect: "csharp", resolverVersion: "1.0.0", imports: [imported("A.B", [], { form: "csharp_using" })] },
      reference("Base"), [definition("A/B.cs", "Base", { exported: false, identity: { language: "C#", dialect: "csharp" } })],
      { knownFiles: ["src/Main.cs", "A/B.cs"] },
    )).toEqual({ status: "unresolved", name: "Base" });
  });
});

describeNative("functional structural resolver", () => {
  test("resolves parser-produced Elixir imports across EX/EXS while isolating foreign dialects", async () => {
    const grammarSet = await loadNativeGrammarSet([{ packageName: "tree-sitter-elixir", version: "0.3.5" }]);
    const runtime = new StructuralRuntime({ grammarSet: () => grammarSet });
    const provider = await runtime.parse({ extension: ".ex", source: Buffer.from("defmodule Util do\n def helper(x), do: x\nend") });
    const consumer = await runtime.parse({ extension: ".exs", source: Buffer.from("import Util\nhelper(1)") });
    expect(provider.status).toBe("ok");
    expect(consumer.status).toBe("ok");
    if (provider.status !== "ok" || consumer.status !== "ok") return;
    const definitions = buildStructuralResolverDefinitions([{
      file: "Util.ex", language: "Elixir", dialect: "elixir", resolverVersion: "1.0.0", structure: provider.structure,
    }]);
    const current = { file: "main.exs", dialect: "elixir-script", resolverVersion: "1.0.0", imports: consumer.structure.imports };
    expect(FUNCTIONAL_LANGUAGE_RESOLVER.resolve(current, reference("helper"), definitions, { knownFiles: ["main.exs", "Util.ex"] }))
      .toMatchObject({ status: "resolved", source: "import", fqn: expect.stringContaining("Util.ex#Util.helper") });
    expect(FUNCTIONAL_LANGUAGE_RESOLVER.resolve(current, reference("missing"), definitions, { knownFiles: ["main.exs", "Util.ex"] }))
      .toEqual({ status: "unresolved", name: "missing" });
    const foreign = [definition("Util.erl", "helper", { identity: { language: "Erlang", dialect: "erlang" } })];
    expect(FUNCTIONAL_LANGUAGE_RESOLVER.resolve(current, reference("helper"), foreign, { knownFiles: ["main.exs", "Util.erl"] }))
      .toEqual({ status: "unresolved", name: "helper" });
  });

  test("resolves native Erlang imports and Clojure refer/alias without namespace leakage", async () => {
    const cases = [
      {
        artifact: { packageName: "tree-sitter-erlang", version: "github:WhatsApp/tree-sitter-erlang#836aa2b6c3af2c7cef3f84049b0ed6d44485a870" },
        providerExtension: ".erl", providerSource: "-module(util).\nrun(X) -> X.\nrun(X,Y) -> {X,Y}.", providerFile: "util.erl", providerDialect: "erlang", language: "Erlang",
        consumerExtension: ".erl", consumerSource: "-module(main).\n-import(util,[run/1]).\nmain(X) -> run(X).", consumerFile: "main.erl", consumerDialect: "erlang",
        name: "run",
      },
      {
        artifact: { packageName: "tree-sitter-clojure-orchard", version: "0.2.5" },
        providerExtension: ".clj", providerSource: "(ns util)\n(defn run [x] x)", providerFile: "util.clj", providerDialect: "clojure", language: "Clojure",
        consumerExtension: ".clj", consumerSource: "(ns main (:require [util :refer [run]]))\n(run 1)", consumerFile: "main.clj", consumerDialect: "clojure",
        name: "run",
      },
    ] as const;
    for (const item of cases) {
      const grammarSet = await loadNativeGrammarSet([item.artifact]);
      const runtime = new StructuralRuntime({ grammarSet: () => grammarSet });
      const provider = await runtime.parse({ extension: item.providerExtension, source: Buffer.from(item.providerSource) });
      const consumer = await runtime.parse({ extension: item.consumerExtension, source: Buffer.from(item.consumerSource) });
      expect(provider.status).toBe("ok"); expect(consumer.status).toBe("ok");
      if (provider.status !== "ok" || consumer.status !== "ok") continue;
      const definitions = buildStructuralResolverDefinitions([{ file: item.providerFile, language: item.language, dialect: item.providerDialect, resolverVersion: "1.0.0", structure: provider.structure }]);
      const resolved = FUNCTIONAL_LANGUAGE_RESOLVER.resolve(
        { file: item.consumerFile, dialect: item.consumerDialect, resolverVersion: "1.0.0", imports: consumer.structure.imports },
        reference(item.name), definitions, { knownFiles: [item.consumerFile, item.providerFile] },
      );
      expect(resolved).toMatchObject({ status: "resolved", source: "import", fqn: expect.stringContaining(`${item.providerFile}#`) });
      if (item.providerDialect === "erlang") {
        expect(resolved).toMatchObject({ identity: { canonicalSignature: expect.stringContaining('"arity":1') } });
      }
    }

    const aliasOnly = [imported("util", [{ imported: "*", local: "u" }], { form: "clojure_require" })];
    const clojureDefinition = [definition("util.clj", "run", { identity: { language: "Clojure", dialect: "clojure", qualifiedName: "util.run", scope: "nested" } })];
    const clojureFile = { file: "main.clj", dialect: "clojure", resolverVersion: "1.0.0", imports: aliasOnly };
    expect(FUNCTIONAL_LANGUAGE_RESOLVER.resolve(clojureFile, reference("run"), clojureDefinition, { knownFiles: ["main.clj", "util.clj"] })).toEqual({ status: "unresolved", name: "run" });
  });

  test("uses Elixir only arity to choose one parser-produced overload", async () => {
    const grammarSet = await loadNativeGrammarSet([{ packageName: "tree-sitter-elixir", version: "0.3.5" }]);
    const runtime = new StructuralRuntime({ grammarSet: () => grammarSet });
    const provider = await runtime.parse({ extension: ".ex", source: Buffer.from("defmodule Util do\n def run(x), do: x\n def run(x,y), do: {x,y}\nend") });
    const consumer = await runtime.parse({ extension: ".exs", source: Buffer.from("import Util, only: [run: 1]\nrun(1)") });
    expect(provider.status).toBe("ok"); expect(consumer.status).toBe("ok");
    if (provider.status !== "ok" || consumer.status !== "ok") return;
    const definitions = buildStructuralResolverDefinitions([{ file: "Util.ex", language: "Elixir", dialect: "elixir", resolverVersion: "1.0.0", structure: provider.structure }]);
    expect(definitions.filter((item) => item.identity.qualifiedName === "Util.run").map((item) => item.identity.arity).sort()).toEqual([1, 2]);
    const resolved = FUNCTIONAL_LANGUAGE_RESOLVER.resolve(
      { file: "main.exs", dialect: "elixir-script", resolverVersion: "1.0.0", imports: consumer.structure.imports },
      reference("run"), definitions, { knownFiles: ["main.exs", "Util.ex"] },
    );
    expect(resolved).toMatchObject({ status: "resolved", source: "import", identity: { canonicalSignature: expect.stringContaining('"arity":1') } });
  });

  test("keeps native Haskell qualified and hiding imports from leaking bare names", async () => {
    const grammarSet = await loadNativeGrammarSet([{ packageName: "tree-sitter-haskell", version: "0.23.1" }]);
    const runtime = new StructuralRuntime({ grammarSet: () => grammarSet });
    const provider = await runtime.parse({ extension: ".hs", source: Buffer.from("module Foo.Bar where\nrun x = x\nsecret x = x") });
    const qualified = await runtime.parse({ extension: ".hs", source: Buffer.from("module Main where\nimport qualified Foo.Bar as FB\nmain x = FB.run x") });
    const hidden = await runtime.parse({ extension: ".hs", source: Buffer.from("module Main where\nimport Foo.Bar hiding (secret)\nmain x = run x") });
    expect(provider.status).toBe("ok"); expect(qualified.status).toBe("ok"); expect(hidden.status).toBe("ok");
    if (provider.status !== "ok" || qualified.status !== "ok" || hidden.status !== "ok") return;
    const definitions = buildStructuralResolverDefinitions([{ file: "Foo/Bar.hs", language: "Haskell", dialect: "haskell", resolverVersion: "1.0.0", structure: provider.structure }]);
    expect(qualified.structure.imports.map(({ specifier, bindings }) => ({ specifier, bindings }))).toEqual([{ specifier: "Foo/Bar", bindings: [{ imported: "*", local: "FB", typeOnly: false }] }]);
    expect(definitions.map((item) => item.identity.qualifiedName)).toEqual(expect.arrayContaining(["Foo.Bar", "Foo.Bar.run"]));
    const build = { knownFiles: ["Main.hs", "Foo/Bar.hs"] };
    const qualifiedFile = { file: "Main.hs", dialect: "haskell", resolverVersion: "1.0.0", imports: qualified.structure.imports };
    expect(FUNCTIONAL_LANGUAGE_RESOLVER.resolve(qualifiedFile, reference("run", { qualifier: "FB" }), definitions, build)).toMatchObject({ status: "resolved", source: "import" });
    expect(FUNCTIONAL_LANGUAGE_RESOLVER.resolve(qualifiedFile, reference("run"), definitions, build)).toEqual({ status: "unresolved", name: "run" });
    const hiddenFile = { file: "Main.hs", dialect: "haskell", resolverVersion: "1.0.0", imports: hidden.structure.imports };
    expect(FUNCTIONAL_LANGUAGE_RESOLVER.resolve(hiddenFile, reference("run"), definitions, build)).toMatchObject({ status: "resolved", source: "import" });
    expect(FUNCTIONAL_LANGUAGE_RESOLVER.resolve(hiddenFile, reference("secret"), definitions, build)).toEqual({ status: "unresolved", name: "secret" });
  });
});

describeNative("TS/JS structural resolver", () => {
  test("resolves a same-file definition before imports and globals", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./lib", [{ imported: "run", local: "run" }])]),
      reference("run"),
      [definition("src/main.ts", "run"), definition("src/lib.ts", "run")],
      BUILD,
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/main.ts#run", source: "same_file" });
  });

  test("resolves named import aliases through extension probing", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./lib", [{ imported: "execute", local: "run" }])]),
      reference("run"),
      [definition("src/lib.ts", "execute")],
      BUILD,
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/lib.ts#execute", source: "import" });
  });

  test("prefers an inner-scope require() binding over a shadowed module-scope one", () => {
    const span = (startByte: number, endByte: number): SourceSpan => Object.freeze({
      startByte,
      endByte,
      start: Object.freeze({ row: 0, column: startByte }),
      end: Object.freeze({ row: 0, column: endByte }),
    });
    const requireImport = (specifier: string, startByte: number, endByte: number): NormalizedStructuralImport => Object.freeze({
      form: "commonjs_require",
      specifier,
      span: span(startByte, endByte),
      bindings: Object.freeze([{ imported: "default", local: "lib", typeOnly: false }]),
      names: Object.freeze(["lib"]),
      typeOnly: false,
    });
    // Module-scope require at byte 10; function-scope rebinding require at byte 100;
    // reference at byte 160 is textually after the inner require, so the inner
    // binding should win and resolve to ./b (not the shadowed module ./a).
    const fileObj = Object.freeze({
      file: "src/main.js",
      dialect: "javascript",
      resolverVersion: "1.0.0",
      imports: Object.freeze([requireImport("./a", 10, 40), requireImport("./b", 100, 130)]),
    });
    const ref = Object.freeze({
      kind: "call",
      span: span(160, 175),
      target: Object.freeze({ status: "unresolved", name: "shadowedFn", qualifier: "lib" }),
    }) as StructuralReference;
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      fileObj,
      ref,
      [definition("src/a.js", "shadowedFn"), definition("src/b.js", "shadowedFn")],
      { knownFiles: ["src/main.js", "src/a.js", "src/b.js"] },
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/b.js#shadowedFn", source: "import" });
  });

  test("forwards a default reexport alias past its barrel export marker", () => {
    const barrelReexport = imported(
      "./lib",
      [{ imported: "default", local: "Service" }],
      { form: "esm_re_export" },
    );
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./barrel", [{ imported: "Service", local: "Service" }])]),
      reference("Service"),
      [
        definition("src/barrel.ts", "Service", { identity: { kind: "export" } }),
        definition("src/lib.ts", "ActualService", { defaultExport: true, identity: { kind: "class" } }),
        definition("src/lib.ts", "default", { defaultExport: true, identity: { kind: "export" } }),
      ],
      {
        knownFiles: ["src/main.ts", "src/barrel.ts", "src/lib.ts"],
        importsByFile: { "src/barrel.ts": [barrelReexport] },
      },
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/lib.ts#ActualService", source: "import" });
  });

  test("maps emitted JavaScript specifiers back to known TypeScript sources", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./lib.js", [{ imported: "execute", local: "run" }])]),
      reference("run"),
      [
        definition("src/barrel.ts", "run", { identity: { kind: "export" } }),
        definition("src/lib.ts", "execute"),
      ],
      BUILD,
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/lib.ts#execute", source: "import" });
  });

  test("prefers a TypeScript source over a competing JavaScript artifact", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./lib.js", [{ imported: "execute", local: "run" }])]),
      reference("run"),
      [definition("src/lib.js", "execute"), definition("src/lib.ts", "execute")],
      { knownFiles: ["src/main.ts", "src/lib.js", "src/lib.ts"] },
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/lib.ts#execute" });
  });

  test("resolves namespace members and index modules", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./pkg", [{ imported: "*", local: "pkg" }])]),
      reference("load", { qualifier: "pkg" }),
      [definition("src/pkg/index.ts", "load")],
      BUILD,
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/pkg/index.ts#load", source: "import" });
  });

  test("resolves nested namespace members without basename leakage", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./pkg", [{ imported: "*", local: "pkg" }])]),
      reference("fetch", { qualifier: "pkg.Api" }),
      [definition("src/pkg/index.ts", "fetch", { identity: { qualifiedName: "Api.fetch", scope: "nested" } })],
      BUILD,
    );
    expect(result).toMatchObject({ status: "resolved", source: "import" });
  });

  test("does not resolve a named import to a nested symbol with the same basename", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./lib", [{ imported: "run", local: "run" }])]),
      reference("run"),
      [definition("src/lib.ts", "run", { identity: { qualifiedName: "Service.run", scope: "nested" } })],
      BUILD,
    );
    expect(result).toEqual({ status: "unresolved", name: "run" });
  });

  test("resolves a bound dynamic import as a namespace", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./lib", [{ imported: "*", local: "mod" }], { form: "dynamic_import" })]),
      reference("run", { qualifier: "mod" }),
      [definition("src/lib.ts", "run")],
      BUILD,
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/lib.ts#run", source: "import" });
  });

  test("resolves default imports only to explicit default-export metadata", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./lib", [{ imported: "default", local: "Service" }])]),
      reference("Service"),
      [definition("src/lib.ts", "create", { defaultExport: true })],
      BUILD,
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/lib.ts#create", source: "import" });
  });

  test("qualifies ESM default members through the actual default owner and retains ambiguity", () => {
    const imports = file([imported("./lib", [{ imported: "default", local: "Service" }])]);
    const resolved = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      imports,
      reference("run", { qualifier: "Service" }),
      [
        definition("src/lib.ts", "ActualService", { defaultExport: true, identity: { kind: "class" } }),
        definition("src/lib.ts", "run", { identity: { qualifiedName: "ActualService.run", scope: "nested", kind: "method" } }),
        definition("src/lib.ts", "run", { identity: { qualifiedName: "Other.run", scope: "nested", kind: "method" } }),
      ],
      BUILD,
    );
    expect(resolved).toMatchObject({
      status: "resolved",
      identity: { qualifiedName: "ActualService.run" },
      source: "import",
    });

    const ambiguous = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      imports,
      reference("run", { qualifier: "Service" }),
      [
        definition("src/lib.ts", "First", { defaultExport: true, identity: { kind: "class" } }),
        definition("src/lib.ts", "Second", { defaultExport: true, identity: { kind: "class" } }),
        definition("src/lib.ts", "run", { identity: { qualifiedName: "First.run", scope: "nested", kind: "method" } }),
        definition("src/lib.ts", "run", { identity: { qualifiedName: "Second.run", scope: "nested", kind: "method" } }),
      ],
      BUILD,
    );
    expect(ambiguous.status).toBe("ambiguous");
    if (ambiguous.status !== "ambiguous") throw new Error("expected default-owner ambiguity");
    expect(ambiguous.candidates.map((candidate) => candidate.qualifiedName)).toEqual(["First.run", "Second.run"]);
  });

  test("resolves CommonJS-style destructured bindings from normalized imports", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./lib", [{ imported: "execute", local: "run" }])]),
      reference("run"),
      [definition("src/lib.ts", "execute")],
      BUILD,
    );
    expect(result.status).toBe("resolved");
  });

  test("resolves path aliases from deterministic build metadata", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("@shared/util", [{ imported: "format", local: "format" }])]),
      reference("format"),
      [definition("shared/util.ts", "format")],
      BUILD,
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "shared/util.ts#format", source: "import" });
  });

  test("does not treat reexports as local bindings", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./lib", [{ imported: "execute", local: "run" }], { form: "esm_re_export" })]),
      reference("run"),
      [definition("src/lib.ts", "execute")],
      BUILD,
    );
    expect(result).toEqual({ status: "unresolved", name: "run" });
  });

  test("gates type-only bindings away from value edges", () => {
    const typeImport = imported(
      "./lib",
      [{ imported: "Shape", local: "Shape", typeOnly: true }],
      { typeOnly: true },
    );
    const definitions = [definition("src/lib.ts", "Shape", { identity: { kind: "type" } })];
    expect(TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([typeImport]), reference("Shape", { kind: "call" }), definitions, BUILD,
    )).toEqual({ status: "unresolved", name: "Shape" });
    expect(TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([typeImport]), reference("Shape", { kind: "type_ref" }), definitions, BUILD,
    )).toMatchObject({ status: "resolved", source: "import" });
  });

  test("uses only an exact unique global match", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file(),
      reference("fetch", { qualifier: "Api" }),
      [definition("src/lib.ts", "fetch", { identity: { qualifiedName: "Api.fetch", scope: "nested" } })],
      BUILD,
    );
    expect(result).toMatchObject({ status: "resolved", source: "global" });
  });

  test("does not expose non-exported definitions through global resolution", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file(),
      reference("privateHelper"),
      [definition("src/lib.ts", "privateHelper", { exported: false })],
      BUILD,
    );
    expect(result).toEqual({ status: "unresolved", name: "privateHelper" });
  });

  test("does not leak nested definitions into unqualified global lookup", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file(),
      reference("fetch"),
      [definition("src/lib.ts", "fetch", { identity: { qualifiedName: "Api.fetch", scope: "nested" } })],
      BUILD,
    );
    expect(result).toEqual({ status: "unresolved", name: "fetch" });
  });

  test("chooses the tightest same-file lexical scope including this and private names", () => {
    const definitions = [
      definition("src/main.ts", "run", { identity: { qualifiedName: "Outer.run", scope: "nested" } }),
      definition("src/main.ts", "run", { identity: { qualifiedName: "Outer.Inner.run", scope: "nested" } }),
      definition("src/main.ts", "#secret", { identity: { qualifiedName: "Outer.Inner.#secret", scope: "nested" } }),
    ];
    expect(TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file(), reference("run", { lexicalScope: "Outer.Inner.method" }), definitions, BUILD,
    )).toMatchObject({ status: "resolved", identity: { qualifiedName: "Outer.Inner.run" } });
    expect(TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file(), reference("#secret", { qualifier: "this", lexicalScope: "Outer.Inner.method" }), definitions, BUILD,
    )).toMatchObject({ status: "resolved", identity: { qualifiedName: "Outer.Inner.%23secret" } });
  });

  test("preserves an already-resolved exact target", () => {
    const exact = definition("src/lib.ts", "run");
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(file(), {
      kind: "call",
      span: SPAN,
      target: { status: "resolved", fqn: "src/lib.ts#run" },
    }, [exact], BUILD);
    expect(result).toMatchObject({ status: "resolved", fqn: "src/lib.ts#run", source: "exact" });
  });

  test("rejects an unknown existing FQN instead of trusting it", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(file(), {
      kind: "call",
      span: SPAN,
      target: { status: "resolved", fqn: "src/missing.ts#run" },
    }, [], BUILD);
    expect(result).toEqual({ status: "unresolved", name: "src/missing.ts#run" });
  });

  test("filters homonymous candidates by edge family", () => {
    const definitions = [
      definition("src/a.ts", "Shape", { identity: { kind: "type" } }),
      definition("src/b.ts", "Shape", { identity: { kind: "function" } }),
    ];
    expect(TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file(), reference("Shape", { kind: "call" }), definitions,
      { knownFiles: ["src/main.ts", "src/a.ts", "src/b.ts"] },
    )).toMatchObject({ status: "resolved", fqn: "src/b.ts#Shape" });
    expect(TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file(), reference("Shape", { kind: "type_ref" }), definitions,
      { knownFiles: ["src/main.ts", "src/a.ts", "src/b.ts"] },
    )).toMatchObject({ status: "resolved", fqn: "src/a.ts#Shape" });
  });

  test("prefers a named default declaration over its anonymous export marker", () => {
    const definitions = [
      definition("src/lib.ts", "Service", { defaultExport: true, identity: { kind: "class" } }),
      definition("src/lib.ts", "default", { defaultExport: true, identity: { kind: "export" } }),
    ];
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./lib", [{ imported: "default", local: "Service" }])]),
      reference("Service"),
      definitions,
      BUILD,
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/lib.ts#Service" });
  });

  test("forwards named reexports through a barrel without binding them locally", () => {
    const barrelReexport = imported(
      "./lib",
      [{ imported: "execute", local: "run" }],
      { form: "esm_re_export" },
    );
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("./barrel", [{ imported: "run", local: "run" }])]),
      reference("run"),
      [
        definition("src/barrel.ts", "run", { identity: { kind: "export" } }),
        definition("src/lib.ts", "execute"),
      ],
      {
        knownFiles: ["src/main.ts", "src/barrel.ts", "src/lib.ts"],
        importsByFile: { "src/barrel.ts": [barrelReexport] },
      },
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "src/lib.ts#execute", source: "import" });
  });

  test("uses the target file alias scope while recursively forwarding a barrel", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("@pkg/barrel", [{ imported: "run", local: "run" }])]),
      reference("run"),
      [definition("packages/a/barrel.ts", "run", { identity: { kind: "export" } }), definition("packages/a/lib.ts", "execute")],
      {
        knownFiles: ["src/main.ts", "packages/a/barrel.ts", "packages/a/lib.ts", "packages/b/lib.ts"],
        pathAliasesByFile: {
          "src/main.ts": [{ pattern: "@pkg/*", targets: ["packages/a/*"] }],
          "packages/a/barrel.ts": [{ pattern: "@lib", targets: ["packages/a/lib"] }],
          "packages/b/barrel.ts": [{ pattern: "@lib", targets: ["packages/b/lib"] }],
        },
        importsByFile: {
          "packages/a/barrel.ts": [imported("@lib", [{ imported: "execute", local: "run" }], { form: "esm_re_export" })],
        },
      },
    );
    expect(result).toMatchObject({ status: "resolved", fqn: "packages/a/lib.ts#execute", source: "import" });
  });

  test("retains deterministic ambiguity instead of choosing the first definition", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file(),
      reference("run"),
      [definition("src/z.ts", "run"), definition("src/a.ts", "run")],
      { knownFiles: ["src/main.ts", "src/z.ts", "src/a.ts"] },
    );
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") throw new Error("expected ambiguity");
    expect(result.candidates.map((candidate) => candidate.fqn)).toEqual(["src/a.ts#run", "src/z.ts#run"]);
  });

  test("returns stable unresolved output for unknown imports and names", () => {
    const result = TYPESCRIPT_LANGUAGE_RESOLVER.resolve(
      file([imported("external-package", [{ imported: "run", local: "run" }])]),
      reference("run"),
      [],
      BUILD,
    );
    expect(result).toEqual({ status: "unresolved", name: "run" });
  });

  test("resolves unique legacy aliases and reports overloaded legacy ambiguity", () => {
    const unique = TYPESCRIPT_LANGUAGE_RESOLVER.resolveLegacy(
      "src/lib.ts#run",
      [definition("src/lib.ts", "run")],
    );
    expect(unique).toMatchObject({ status: "resolved", fqn: "src/lib.ts#run", source: "legacy" });

    const overloaded = [
      definition("src/lib.ts", "run", { identity: { overload: "overloaded", arity: 0 } }),
      definition("src/lib.ts", "run", { identity: { overload: "overloaded", arity: 1 } }),
    ];
    const ambiguous = TYPESCRIPT_LANGUAGE_RESOLVER.resolveLegacy("src/lib.ts#run", overloaded);
    expect(ambiguous).toMatchObject({ status: "ambiguous", name: "src/lib.ts#run" });
    if (ambiguous.status !== "ambiguous") throw new Error("expected ambiguity");
    expect(ambiguous.candidates).toHaveLength(2);
  });

  test("adapts normalized documents, infers overload identities, and resolves through a versioned session", () => {
    const document = Object.freeze({
      file: "src/main.ts",
      language: "TypeScript",
      dialect: "typescript",
      resolverVersion: "1.0.0",
      structure: Object.freeze({
        symbols: Object.freeze([
          symbol("run", "Service.run", { signatureMaterial: { arity: 0, typeTokens: [], modifiers: [] } }),
          symbol("run", "Service.run", { signatureMaterial: { arity: 1, typeTokens: ["string"], modifiers: [] } }),
        ]),
        imports: Object.freeze([]),
        edges: Object.freeze([]),
      }),
    });
    const definitions = buildStructuralResolverDefinitions([document]);
    expect(definitions.map((item) => item.identity.overload)).toEqual(["overloaded", "overloaded"]);
    expect(definitions.every((item) => item.identity.scope === "nested")).toBe(true);

    const session = new StructuralResolverSession(
      [document],
      { knownFiles: ["src/main.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
    );
    const result = session.resolve("src/main.ts", reference("run"));
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") throw new Error("expected overload ambiguity");
    expect(result.candidates).toHaveLength(2);
    expect(session.identitiesFor("src/main.ts")).toHaveLength(2);
    expect(session.resolveFqn(result.candidates[0]!.fqn)).toMatchObject({ found: true });
  });

  // `class Same` + `interface Same` is TypeScript declaration merging — legal
  // source. It used to abort the entire index with `fqn_identity_collision`,
  // because the uniqueness count was keyed on `(file, qualifiedName, kind)`
  // while the FQN it guards is `file#name`: each declaration sat alone in its
  // kind group, each was classified `unique`, and both claimed `src/main.ts#Same`.
  // Same-name/same-kind never had this problem — it shared a group and
  // disambiguated. See `declarationGroupKey` in resolver.ts.
  test("disambiguates same-name different-kind declarations instead of aborting", () => {
    const document = {
      file: "src/main.ts",
      language: "TypeScript",
      dialect: "typescript",
      resolverVersion: "1.0.0",
      structure: {
        symbols: [symbol("Same", "Same", { kind: "class" }), symbol("Same", "Same", { kind: "interface" })],
        imports: [],
        edges: [],
      },
    };

    const definitions = buildStructuralResolverDefinitions([document]);
    expect(definitions.map((item) => item.identity.overload)).toEqual(["overloaded", "overloaded"]);

    const session = new StructuralResolverSession(
      [document],
      { knownFiles: ["src/main.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
    );

    // Both keep an identity, and the two identities are distinct — the point of
    // the repair is not merely "does not throw" but "each declaration is still
    // addressable".
    const identities = session.identitiesFor("src/main.ts");
    expect(identities).toHaveLength(2);
    const fqns = identities.map((item) => item.fqn);
    expect(new Set(fqns).size).toBe(2);
    // Neither may claim the bare `file#name` form; that is the shape that collided.
    expect(fqns.every((fqn) => fqn !== "src/main.ts#Same")).toBe(true);
    expect(fqns.every((fqn) => session.resolveFqn(fqn).found)).toBe(true);
  });

  // Discriminating sensor for the repair. A same-name/same-kind pair was ALREADY
  // handled before the fix, so a test using one cannot tell the two states
  // apart. Only a different-kind pair can, and this asserts the kind-free group
  // key directly: restore `\0${symbol.kind}` to `declarationGroupKey` and the
  // counts below drop to 1, `overload` reverts to "unique", and the session
  // throws again.
  test("counts a name as claimed once per file regardless of declaration kind", () => {
    const document = {
      file: "src/merged.ts",
      language: "TypeScript",
      dialect: "typescript",
      resolverVersion: "1.0.0",
      structure: {
        symbols: [
          symbol("total", "total", { kind: "variable" }),
          symbol("total", "total", { kind: "constant" }),
          symbol("solo", "solo", { kind: "function" }),
        ],
        imports: [],
        edges: [],
      },
    };

    const definitions = buildStructuralResolverDefinitions([document]);
    const byKind = new Map(definitions.map((item) => [item.identity.kind, item.identity]));

    // The contested name is overloaded on BOTH sides, not just the later one.
    expect(byKind.get("variable")!.overload).toBe("overloaded");
    expect(byKind.get("constant")!.overload).toBe("overloaded");
    // An uncontested name in the same file keeps the simple FQN — the repair
    // widens the group key, it does not disable the legacy shape.
    expect(byKind.get("function")!.overload).toBe("unique");

    const session = new StructuralResolverSession(
      [document],
      { knownFiles: ["src/merged.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
    );
    const fqns = session.identitiesFor("src/merged.ts").map((item) => item.fqn);
    expect(fqns).toContain("src/merged.ts#solo");
    expect(new Set(fqns).size).toBe(3);
  });

  test("does not propagate exported-class visibility to a percent-encoded private member", () => {
    const definitions = buildStructuralResolverDefinitions([{
      file: "src/lib.ts",
      language: "TypeScript",
      dialect: "typescript",
      resolverVersion: "1.0.0",
      structure: {
        symbols: [
          symbol("Service", "Service", { kind: "class", exported: true }),
          symbol("%23secret", "Service.%23secret", { kind: "method", exported: false }),
        ],
        imports: [],
        edges: [],
      },
    }]);
    expect(definitions.find((item) => item.identity.name === "%23secret")?.exported).toBe(false);
  });

  test("resolveFqn resolves a unique legacy alias from seed identities", () => {
    // Covers resolver.ts lines 275-276: resolveFqn finds a single seed identity
    // whose legacyFqn matches the query (after exact + local registry miss).
    const registry = new StructuralFqnRegistry();
    const seedIdentity = registry.register(identity("src/lib.ts", "run", {
      scope: "nested", overload: "unique", kind: "method", arity: 0, qualifiedName: "Service.run",
    }));
    // legacyFqn = src/lib.ts#run; fqn = src/lib.ts#Service.run~method~<hash>
    expect(seedIdentity.legacyFqn).toBe("src/lib.ts#run");
    expect(seedIdentity.fqn).not.toBe(seedIdentity.legacyFqn);

    const seedDef: StructuralResolverDefinition = {
      identity: identity("src/lib.ts", "run", { scope: "nested", overload: "unique", kind: "method", arity: 0, qualifiedName: "Service.run" }),
      resolvedIdentity: seedIdentity,
      exported: true,
    };
    const session = new StructuralResolverSession(
      [], { knownFiles: ["src/lib.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
      [seedDef],
    );
    // resolveFqn with the legacy FQN → not exact match, not in local registry,
    // but matches a single seed identity's legacyFqn → resolved
    const result = session.resolveFqn("src/lib.ts#run");
    expect(result.found).toBe(true);
    expect(result.ambiguous).toBe(false);
    if (result.found) expect(result.identity.fqn).toBe(seedIdentity.fqn);
  });

  test("resolveFqn reports ambiguous legacy alias from multiple seed identities", () => {
    // Covers resolver.ts lines 277-295: multiple seed identities share the same
    // legacyFqn → ambiguous with sorted candidates.
    const registry = new StructuralFqnRegistry();
    const seed1 = registry.register(identity("src/lib.ts", "run", {
      scope: "nested", overload: "overloaded", kind: "method", arity: 0, typeTokens: [], qualifiedName: "Service.run",
    }));
    const seed2 = registry.register(identity("src/lib.ts", "run", {
      scope: "nested", overload: "overloaded", kind: "method", arity: 1, typeTokens: ["string"], qualifiedName: "Service.run",
    }));
    // Both have legacyFqn = src/lib.ts#run but different FQNs (different arity)
    expect(seed1.legacyFqn).toBe("src/lib.ts#run");
    expect(seed2.legacyFqn).toBe("src/lib.ts#run");
    expect(seed1.fqn).not.toBe(seed2.fqn);

    const seedDefs: StructuralResolverDefinition[] = [
      { identity: identity("src/lib.ts", "run", { scope: "nested", overload: "overloaded", kind: "method", arity: 0, typeTokens: [], qualifiedName: "Service.run" }), resolvedIdentity: seed1, exported: true },
      { identity: identity("src/lib.ts", "run", { scope: "nested", overload: "overloaded", kind: "method", arity: 1, typeTokens: ["string"], qualifiedName: "Service.run" }), resolvedIdentity: seed2, exported: true },
    ];
    const session = new StructuralResolverSession(
      [], { knownFiles: ["src/lib.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
      seedDefs,
    );
    const result = session.resolveFqn("src/lib.ts#run");
    expect(result.found).toBe(false);
    expect(result.ambiguous).toBe(true);
    if (!result.found && result.ambiguous) {
      expect(result.legacyFqn).toBe("src/lib.ts#run");
      expect(result.candidates.length).toBe(2);
    }
  });

  test("resolveFqn returns not-found for an unknown FQN", () => {
    const session = new StructuralResolverSession(
      [], { knownFiles: [] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
    );
    const result = session.resolveFqn("src/unknown.ts#missing");
    expect(result.found).toBe(false);
    expect(result.ambiguous).toBe(false);
  });

  test("resolveFqn finds exact seed identity by modern FQN", () => {
    // Covers resolver.ts line 271-272: exact match in seedIdentities.
    const registry = new StructuralFqnRegistry();
    const seedIdentity = registry.register(identity("src/lib.ts", "run", {
      scope: "top_level", overload: "unique", kind: "function", arity: 0,
    }));
    const seedDef: StructuralResolverDefinition = {
      identity: identity("src/lib.ts", "run", { scope: "top_level", overload: "unique", kind: "function", arity: 0 }),
      resolvedIdentity: seedIdentity,
      exported: true,
    };
    const session = new StructuralResolverSession(
      [], { knownFiles: ["src/lib.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
      [seedDef],
    );
    // Exact FQN match in seedIdentities
    const result = session.resolveFqn(seedIdentity.fqn);
    expect(result.found).toBe(true);
    expect(result.ambiguous).toBe(false);
  });

  test("resolveFqn finds identity via local FQN registry when not a seed", () => {
    // Covers resolver.ts line 273-274: local registry resolve finds it.
    const doc = Object.freeze({
      file: "src/main.ts", language: "TypeScript", dialect: "typescript", resolverVersion: "1.0.0",
      structure: Object.freeze({
        symbols: Object.freeze([symbol("run")]),
        imports: Object.freeze([]), edges: Object.freeze([]),
      }),
    });
    const session = new StructuralResolverSession(
      [doc], { knownFiles: ["src/main.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
    );
    // The local definition is registered in fqnRegistry → resolveFqn finds it
    const result = session.resolveFqn("src/main.ts#run");
    expect(result.found).toBe(true);
  });

  test("resolve throws when document is missing for file", () => {
    const session = new StructuralResolverSession(
      [], { knownFiles: [] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
    );
    expect(() => session.resolve("src/missing.ts", reference("run"))).toThrow("structural_resolver_document_missing");
  });

  test("resolve infers lexical scope from containing symbol when not provided", () => {
    // Covers resolver.ts lines 304-315: lexicalScope inference from document symbols.
    const SPAN_LOCAL = Object.freeze({
      startByte: 10, endByte: 20,
      start: Object.freeze({ row: 0, column: 10 }),
      end: Object.freeze({ row: 0, column: 20 }),
    });
    const OUTER_SPAN = Object.freeze({
      startByte: 0, endByte: 50,
      start: Object.freeze({ row: 0, column: 0 }),
      end: Object.freeze({ row: 0, column: 50 }),
    });
    const doc = Object.freeze({
      file: "src/main.ts", language: "TypeScript", dialect: "typescript", resolverVersion: "1.0.0",
      structure: Object.freeze({
        symbols: Object.freeze([
          { ...symbol("Outer", "Outer", { kind: "class" }), span: OUTER_SPAN },
          { ...symbol("inner", "Outer.inner", { kind: "method" }), span: SPAN_LOCAL },
        ]),
        imports: Object.freeze([]), edges: Object.freeze([]),
      }),
    });
    const session = new StructuralResolverSession(
      [doc], { knownFiles: ["src/main.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
    );
    // Reference inside Outer.inner (byte 15) without lexicalScope → should
    // infer the containing symbol and resolve accordingly.
    const ref = Object.freeze({
      kind: "call" as const,
      span: Object.freeze({ startByte: 15, endByte: 16, start: Object.freeze({ row: 0, column: 15 }), end: Object.freeze({ row: 0, column: 16 }) }),
      target: Object.freeze({ status: "unresolved" as const, name: "inner" }),
    });
    const result = session.resolve("src/main.ts", ref);
    // Should resolve to the local same-file definition Outer.inner
    expect(result.status).toBe("resolved");
  });

  test("seed construction throws on identity collision with local definition", () => {
    // Covers resolver.ts lines 237-241: seed identity collides with a local
    // definition but has a different canonical signature / exported flag.
    const registry = new StructuralFqnRegistry();
    const seedIdentity = registry.register(identity("src/lib.ts", "run", {
      scope: "top_level", overload: "unique", kind: "function", arity: 0,
    }));
    const doc = Object.freeze({
      file: "src/lib.ts", language: "TypeScript", dialect: "typescript", resolverVersion: "1.0.0",
      structure: Object.freeze({
        symbols: Object.freeze([symbol("run", "run", { signatureMaterial: { arity: 1, typeTokens: ["string"], modifiers: [] } })]),
        imports: Object.freeze([]), edges: Object.freeze([]),
      }),
    });
    // The local definition will have a different canonical signature (arity 1 vs 0)
    // → fqn_identity_collision when the seed is checked against it.
    const seedDef: StructuralResolverDefinition = {
      identity: identity("src/lib.ts", "run", { scope: "top_level", overload: "unique", kind: "function", arity: 0 }),
      resolvedIdentity: seedIdentity,
      exported: true,
    };
    expect(() => new StructuralResolverSession(
      [doc], { knownFiles: ["src/lib.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
      [seedDef],
    )).toThrow("fqn_identity_collision");
  });

  test("seed construction throws when seed definition lacks resolvedIdentity", () => {
    // Covers resolver.ts line 236: seed requires a materialized identity.
    const seedDef: StructuralResolverDefinition = {
      identity: identity("src/lib.ts", "run"),
      resolvedIdentity: undefined,
      exported: true,
    };
    expect(() => new StructuralResolverSession(
      [], { knownFiles: ["src/lib.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
      [seedDef],
    )).toThrow(TypeError);
  });

  test("seed construction deduplicates matching seed with identical identity", () => {
    // Covers resolver.ts lines 242-244: seed identity matches a local definition
    // with same canonical signature → silently deduplicated (no collision).
    const registry = new StructuralFqnRegistry();
    const seedIdentity = registry.register(identity("src/lib.ts", "run", {
      scope: "top_level", overload: "unique", kind: "function", arity: 0,
    }));
    const doc = Object.freeze({
      file: "src/lib.ts", language: "TypeScript", dialect: "typescript", resolverVersion: "1.0.0",
      structure: Object.freeze({
        symbols: Object.freeze([symbol("run", "run", { signatureMaterial: { arity: 0, typeTokens: [], modifiers: [] } })]),
        imports: Object.freeze([]), edges: Object.freeze([]),
      }),
    });
    const seedDef: StructuralResolverDefinition = {
      identity: identity("src/lib.ts", "run", { scope: "top_level", overload: "unique", kind: "function", arity: 0 }),
      resolvedIdentity: seedIdentity,
      exported: true,
      defaultExport: false,
    };
    // Should NOT throw — the seed matches the local definition exactly
    const session = new StructuralResolverSession(
      [doc], { knownFiles: ["src/lib.ts"] },
      new StructuralResolverRegistry([TYPESCRIPT_LANGUAGE_RESOLVER]),
      [seedDef],
    );
    expect(session.identitiesFor("src/lib.ts").length).toBe(1);
  });
});
