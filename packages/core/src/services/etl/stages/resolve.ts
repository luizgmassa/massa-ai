/**
 * ETL Stage 3 — Resolve
 *
 * Resolves import specifiers to concrete relative file paths within the project.
 * Fills in ResolvedImport.resolvedPath and RawSymbol.fqn for each ParsedFile.
 *
 * Resolution strategy (TS/JS):
 *   1. Relative imports (./  ../) → path.resolve + extension probing
 *   2. Workspace aliases (@massa-th0th/core, etc.) → read tsconfig.json paths
 *   3. Everything else → external (npm), resolvedPath = null
 */

import path from "path";
import fs from "fs";
import { logger } from "@massa-th0th/shared";
import { getSymbolRepository } from "../../../data/sqlite/symbol-repository-factory.js";
import type {
  EtlStageContext,
  ParsedFile,
  ResolvedFile,
  ResolvedImport,
  ResolvedEdge,
  RawImport,
  RawSymbol,
} from "../stage-context.js";

const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"];

interface TsPathAlias {
  prefix: string;
  targets: string[];
  packagePath?: string;
}

interface MonorepoPackage {
  path: string;
  relativePath: string;
  aliases: TsPathAlias[];
}

export class ResolveStage {
  async run(ctx: EtlStageContext, files: ParsedFile[]): Promise<ResolvedFile[]> {
    const t0 = performance.now();

    ctx.emit({
      type: "stage_start",
      stage: "resolve",
      payload: { total: files.length },
      timestamp: Date.now(),
    });

    // Build lookup set of all known relative paths (for O(1) membership checks)
    const knownRelPaths = new Set(files.map((f) => f.file.relativePath));

    // Build a global symbol-name → FQN index. SEED from the repo (all
    // definitions persisted for this project — includes symbols from
    // fingerprint-skipped unchanged files) then OVERLAY in-batch symbols so
    // files parsed THIS run take precedence (strictly fresher). A name may
    // map to multiple FQNs (overloads, re-exports); first definition wins
    // within each source. This closes the D1 cross-file gap: a call edge in
    // a newly-indexed file can now resolve to a callee defined in an
    // unchanged file that was fingerprint-skipped this run.
    const symbolIndex = await this.buildSymbolIndex(ctx.projectId, files);

    // Parse tsconfig.json compilerOptions.paths for workspace alias resolution
    const rootAliases = this.loadTsConfigPaths(ctx.projectPath);

    // Detect monorepo packages and load their tsconfigs
    const monorepoPackages = this.detectMonorepoPackages(ctx.projectPath, files);

    const resolved: ResolvedFile[] = [];
    let processed = 0;

    for (const parsedFile of files) {
      const resolvedFile = this.resolveFile(
        parsedFile,
        ctx.projectPath,
        knownRelPaths,
        rootAliases,
        monorepoPackages,
        symbolIndex,
      );
      resolved.push(resolvedFile);
      processed++;

      if (processed % 50 === 0) {
        ctx.emit({
          type: "progress",
          stage: "resolve",
          payload: {
            current: processed,
            total: files.length,
            percentage: Math.round((processed / files.length) * 100),
          },
          timestamp: Date.now(),
        });
      }
    }

    const durationMs = Math.round(performance.now() - t0);

    ctx.emit({
      type: "stage_end",
      stage: "resolve",
      payload: { total: resolved.length, durationMs },
      timestamp: Date.now(),
    });

    logger.info("ETL Resolve complete", { projectId: ctx.projectId, total: resolved.length, durationMs });

    return resolved;
  }

  private resolveFile(
    parsed: ParsedFile,
    projectPath: string,
    knownRelPaths: Set<string>,
    rootAliases: TsPathAlias[],
    monorepoPackages: MonorepoPackage[],
    symbolIndex: Map<string, string>,
  ): ResolvedFile {
    const fromDir = path.dirname(path.join(projectPath, parsed.file.relativePath));

    // Determine which package this file belongs to
    const packageAliases = this.getPackageAliases(parsed.file.relativePath, monorepoPackages);

    // Merge package-specific aliases with root aliases (package aliases take precedence)
    const allAliases = [...packageAliases, ...rootAliases];

    // Resolve imports
    const resolvedImports: ResolvedImport[] = parsed.rawImports.map((raw) => {
      const result = this.resolveSpecifier(raw.specifier, fromDir, projectPath, knownRelPaths, allAliases);
      return { raw, ...result };
    });

    // Fill FQN for each symbol: '{relativePath}#{symbolName}'
    const symbolsWithFqn = parsed.symbols.map((sym) => ({
      ...sym,
      fqn: `${parsed.file.relativePath}#${sym.name}`,
    }));

    // Build import resolution maps for this file:
    //   importNameToPath  — named import binding → defining file path
    //   namespaceToPath   — namespace/default binding ('*' or 'default') → file path
    // so a call to an imported symbol OR a member of a namespace import
    // (`svc.fetch()`, `Lib.helper()`) resolves to its defining file. Namespace
    // member resolution is best-effort: the extractor captures only the final
    // callee token, so we fall back to the project-wide symbol index when the
    // bare callee is not itself a direct named import.
    const importNameToPath = new Map<string, string | null>();
    const namespaceToPath = new Map<string, string>();
    for (const ri of resolvedImports) {
      if (ri.external || !ri.resolvedPath) continue;
      for (const name of ri.raw.names) {
        if (name === "*" || name === "default") {
          // Whole-module binding: the local alias is the FIRST identifier in
          // the import statement; raw.names only records '*'/'default' so we
          // can't recover the alias here without the parse stage exposing it.
          // Record the path under both sentinel names as a fallback.
          namespaceToPath.set(name, ri.resolvedPath);
        } else {
          importNameToPath.set(name, ri.resolvedPath);
        }
      }
    }

    // Resolve typed structural edges (D1): map each edge's callee/target name
    // to a FQN via (1) same-file symbol, (2) import resolution, (3) global index.
    const localNames = new Set(parsed.symbols.map((s) => s.name));
    const resolvedEdges: ResolvedEdge[] = (parsed.rawEdges ?? []).map((edge) => {
      const targetFqn = this.resolveEdgeTarget(
        edge.symbolName,
        parsed.file.relativePath,
        localNames,
        importNameToPath,
        namespaceToPath,
        symbolIndex,
      );
      // Stamp the caller FQN into meta for downstream traversal.
      const meta = { ...(edge.meta ?? {}) };
      if (edge.callerSymbol) {
        meta.callerFqn = `${parsed.file.relativePath}#${edge.callerSymbol}`;
      }
      return { ...edge, meta, targetFqn };
    });

    return {
      ...parsed,
      symbols: symbolsWithFqn,
      resolvedImports,
      resolvedEdges,
    };
  }

  /**
   * Resolve a callee/target symbol name to a FQN.
   * Strategy:
   *   1. Defined in the same file → '{thisFile}#{name}'
   *   2. Direct named import from a resolved path → '{resolvedPath}#{name}'
   *   3. Namespace/default import bound — try the resolved module, then the
   *      project-wide index for the bare callee (covers `ns.method()`)
   *   4. Unique global definition across repo+batch → that FQN
   *   5. Otherwise undefined (target_fqn left null; row still retained)
   */
  private resolveEdgeTarget(
    name: string,
    thisFile: string,
    localNames: Set<string>,
    importNameToPath: Map<string, string | null>,
    namespaceToPath: Map<string, string>,
    symbolIndex: Map<string, string>,
  ): string | undefined {
    if (localNames.has(name)) return `${thisFile}#${name}`;
    const importedPath = importNameToPath.get(name);
    if (importedPath) return `${importedPath}#${name}`;
    // Namespace/default binding: the bare callee may be a member of the
    // imported module. First try the imported module's file-scoped FQN, then
    // fall through to the project-wide index (handles re-exports + aliases).
    const nsPath = namespaceToPath.get("*") ?? namespaceToPath.get("default");
    if (nsPath) {
      const nsFqn = `${nsPath}#${name}`;
      if (symbolIndex.has(name)) return symbolIndex.get(name);
      return nsFqn; // best-effort: assume the module exports the callee
    }
    const globalFqn = symbolIndex.get(name);
    return globalFqn; // may be undefined
  }

  /**
   * Build a symbol-name → FQN index. SEED from the repo (all persisted
   * definitions for the project, including fingerprint-skipped unchanged
   * files) then OVERLAY in-batch symbols UNCONDITIONALLY so the just-parsed
   * files take precedence over stale repo rows. First definition wins within
   * each source, but in-batch always overrides repo for the same name.
   * Project-wide resolution closes the D1 cross-file gap.
   *
   * Note: {@link getSymbolRepository} is sync for SQLite and async for PG;
   * `await` works for both (await on a non-thenable returns the value).
   */
  private async buildSymbolIndex(
    projectId: string,
    files: ParsedFile[],
  ): Promise<Map<string, string>> {
    const index = new Map<string, string>();

    // 1. Seed from the repo (project-wide), first-def-wins. Catches unchanged
    //    files that are fingerprint-skipped this run.
    try {
      const repoSyms = await getSymbolRepository().listAllDefinitions(projectId);
      for (const def of repoSyms) {
        if (index.has(def.name)) continue;
        index.set(def.name, `${def.file_path}#${def.name}`);
      }
    } catch (err) {
      logger.warn("buildSymbolIndex: repo seed failed, in-batch only", {
        projectId,
        error: (err as Error)?.message,
      });
    }

    // 2. Overlay in-batch symbols. First-def-wins WITHIN the batch, but the
    //    batch UNCONDITIONALLY overrides repo rows for the same name (in-batch
    //    is strictly fresher — those files were just parsed this run).
    const inBatch = new Map<string, string>();
    for (const f of files) {
      for (const sym of f.symbols) {
        if (inBatch.has(sym.name)) continue;
        inBatch.set(sym.name, `${f.file.relativePath}#${sym.name}`);
      }
    }
    for (const [name, fqn] of inBatch) {
      index.set(name, fqn);
    }
    return index;
  }

  private resolveSpecifier(
    specifier: string,
    fromDir: string,
    projectPath: string,
    knownRelPaths: Set<string>,
    aliases: TsPathAlias[],
  ): { resolvedPath: string | null; external: boolean } {
    // 1. Relative imports
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const resolved = this.probeExtensions(
        path.resolve(fromDir, specifier),
        projectPath,
        knownRelPaths,
      );
      return { resolvedPath: resolved, external: false };
    }

    // 2. Workspace alias resolution
    for (const alias of aliases) {
      if (specifier === alias.prefix || specifier.startsWith(alias.prefix + "/")) {
        const suffix = specifier.slice(alias.prefix.length);
        
        for (const target of alias.targets) {
          const cleanTarget = target.replace(/\/\*$/, "");
          
          // If alias has a packagePath, resolve relative to that package
          const basePath = alias.packagePath 
            ? path.join(projectPath, alias.packagePath)
            : projectPath;
            
          const absPath = path.join(basePath, cleanTarget + suffix);
          const resolved = this.probeExtensions(absPath, projectPath, knownRelPaths);
          if (resolved) return { resolvedPath: resolved, external: false };
        }
      }
    }

    // 3. External package
    return { resolvedPath: null, external: true };
  }

  /**
   * Tries the path as-is, then with common TS/JS extensions and /index variants.
   * Returns the relative path if found in knownRelPaths, or null.
   */
  private probeExtensions(
    absPath: string,
    projectPath: string,
    knownRelPaths: Set<string>,
  ): string | null {
    const candidates = [
      absPath,
      ...TS_EXTENSIONS.map((ext) => absPath + ext),
      ...TS_EXTENSIONS.map((ext) => absPath.replace(/\.[^.]+$/, ext)),
    ];

    for (const candidate of candidates) {
      const rel = path.relative(projectPath, candidate).replace(/\\/g, "/");
      if (knownRelPaths.has(rel)) return rel;
    }

    return null;
  }

  /**
   * Parse tsconfig.json compilerOptions.paths into a flat alias list.
   * Handles standard monorepo setups like { "@massa-th0th/core/*": ["packages/core/src/*"] }.
   */
  private loadTsConfigPaths(projectPath: string, packageBase?: string): TsPathAlias[] {
    const aliases: TsPathAlias[] = [];
    const tsconfigPath = path.join(projectPath, "tsconfig.json");

    try {
      const raw = fs.readFileSync(tsconfigPath, "utf-8");
      // Strip JSON comments (tsconfig allows them)
      const stripped = raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const tsconfig = JSON.parse(stripped);
      const paths: Record<string, string[]> = tsconfig?.compilerOptions?.paths ?? {};

      for (const [alias, targets] of Object.entries(paths)) {
        // "@massa-th0th/core/*" → prefix "@massa-th0th/core"
        const prefix = alias.replace(/\/\*$/, "");
        aliases.push({ 
          prefix, 
          targets,
          packagePath: packageBase,
        });
      }
    } catch {
      // No tsconfig or parse error — silently skip alias resolution
    }

    return aliases;
  }

  /**
   * Detect monorepo packages by scanning for tsconfig.json files in common locations.
   * Supports: packages/*, apps/*, and workspace definitions in package.json
   */
  private detectMonorepoPackages(projectPath: string, files: ParsedFile[]): MonorepoPackage[] {
    const packages: MonorepoPackage[] = [];
    const packagePaths = new Set<string>();

    // Extract unique package directories from file paths
    for (const file of files) {
      const parts = file.file.relativePath.split("/");
      
      // Check for packages/* or apps/* pattern
      for (let i = 0; i < parts.length - 1; i++) {
        if ((parts[i] === "packages" || parts[i] === "apps") && parts[i + 1]) {
          const packageRelPath = parts.slice(0, i + 2).join("/");
          packagePaths.add(packageRelPath);
          break;
        }
      }
    }

    // Load tsconfig for each detected package
    for (const packageRelPath of packagePaths) {
      const absPackagePath = path.join(projectPath, packageRelPath);
      const aliases = this.loadTsConfigPaths(absPackagePath, packageRelPath);
      
      if (aliases.length > 0) {
        packages.push({
          path: absPackagePath,
          relativePath: packageRelPath,
          aliases,
        });
      }
    }

    if (packages.length > 0) {
      logger.info("Detected monorepo packages", { 
        projectPath, 
        packageCount: packages.length,
        packages: packages.map(p => p.relativePath),
      });
    }

    return packages;
  }

  /**
   * Get aliases for the package that contains the given file.
   */
  private getPackageAliases(filePath: string, packages: MonorepoPackage[]): TsPathAlias[] {
    for (const pkg of packages) {
      if (filePath.startsWith(pkg.relativePath + "/") || filePath.startsWith(pkg.relativePath)) {
        return pkg.aliases;
      }
    }
    return [];
  }
}
