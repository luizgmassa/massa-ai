#!/usr/bin/env bun
/**
 * validate_audit_report.ts - deterministic schema/ID checks for a saved
 * audit report markdown file (STO-9 top validator pack).
 *
 * Replaces the inline "reread the report and eyeball the finding IDs"
 * checklist prose that used to live in `references/audit-report-io.md` and
 * the 9 `*-fix.md` workflows with a scripted check, parameterized by report
 * family:
 *
 *   - metadata field presence (common freshness header + per-family extras)
 *   - PREFIX-N finding-ID format (or `<Area>/<PREFIX>-N` for the
 *     implementation composite family)
 *   - Area<->Prefix table membership (implementation family only) - rejects
 *     unrecognized Areas, mismatched Area/Prefix pairs, and raw `SONAR-*`
 *     executable IDs
 *   - finding-ID uniqueness within the report
 *   - gap-free per-prefix (or per-area) sequencing: N, N+1, N+2, ... with no
 *     skipped numbers
 *
 * Operates only on the saved report markdown - never on the target
 * codebase - so it stays stack-agnostic. Bun builtins only, zero
 * dependencies, same heuristic-markdown-inspection style as validate_spec.ts.
 *
 * Usage:
 *   bun skills/massa-ai/scripts/validate_audit_report.ts <report.md> [--family NAME] [--strict]
 *
 *   report.md   Path to a saved audit report markdown file.
 *   --family    One of: architecture | bugs | code-quality | security |
 *               requirements | tests | maestro | mobile-figma | implementation
 *               Auto-detected from the report's `Workflow:` metadata line
 *               when omitted.
 *   --strict    Treat warnings as errors.
 *
 * Exit codes: 0 pass, 1 errors found (or warnings under --strict), 2 usage error.
 */

import { existsSync, readFileSync } from "node:fs";

interface FamilyConfig {
  workflow: string;
  /** Single-lens/MFM/MST prefix, or null for the implementation composite family. */
  prefix: string | null;
  extraMetadata: string[];
}

const COMMON_METADATA = [
  "Date",
  "Workflow",
  "ProjectId",
  "WorkflowSessionId",
  "Target",
  "Target Focus",
  "Scope",
  "Git Base",
  "Git Head",
  "Source Evidence Timestamp",
];

/** Canonical area/prefix pairs (audit-report-io.md, Source-Qualified Finding IDs). */
const AREA_PREFIX: Array<{ area: string; prefix: string }> = [
  { area: "Correctness", prefix: "BUG" },
  { area: "Architecture", prefix: "ARCH" },
  { area: "Code Quality", prefix: "CQ" },
  { area: "Security", prefix: "SEC" },
  { area: "Requirements", prefix: "REQ" },
  { area: "Tests", prefix: "TST" },
];

const FAMILIES: Record<string, FamilyConfig> = {
  architecture: { workflow: "architecture-audit", prefix: "ARCH", extraMetadata: ["Requirements Source"] },
  bugs: { workflow: "bugs-audit", prefix: "BUG", extraMetadata: ["Requirements Source"] },
  "code-quality": { workflow: "code-quality-audit", prefix: "CQ", extraMetadata: ["Requirements Source"] },
  security: { workflow: "security-audit", prefix: "SEC", extraMetadata: ["Requirements Source"] },
  requirements: { workflow: "requirements-audit", prefix: "REQ", extraMetadata: ["Requirements Source"] },
  tests: { workflow: "tests-audit", prefix: "TST", extraMetadata: ["Requirements Source"] },
  maestro: {
    workflow: "maestro-audit",
    prefix: "MST",
    extraMetadata: ["Scenario Source", "Maestro CLI", "Device/Emulator Readiness"],
  },
  "mobile-figma": {
    workflow: "mobile-figma-audit",
    prefix: "MFM",
    extraMetadata: ["Repository Classification", "Figma Source", "Figma Evidence Timestamp", "Requirements Source"],
  },
  implementation: { workflow: "implementation-audit", prefix: null, extraMetadata: ["Requirements Source"] },
};

/** Mirrors Python's str.splitlines(): universal newline split, no trailing empty element. */
function splitLines(text: string): string[] {
  if (text === "") return [];
  const result: string[] = [];
  const lineBreakRe = /\r\n|\r|\n/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = lineBreakRe.exec(text)) !== null) {
    result.push(text.slice(start, match.index));
    start = match.index + match[0].length;
  }
  if (start < text.length) result.push(text.slice(start));
  return result;
}

/** Metadata lines live between the `# Title` line and the first `##` heading. */
function metadataBounds(lines: string[]): [number, number] {
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+\S/.test(lines[i]!)) {
      start = i + 1;
      break;
    }
  }
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return [start, end];
}

function parseMetadata(lines: string[]): Map<string, string> {
  const [start, end] = metadataBounds(lines);
  const fields = new Map<string, string>();
  const lineRe = /^([A-Za-z][A-Za-z /]*?):\s*(.*)$/;
  for (let i = start; i < end; i++) {
    const m = lineRe.exec(lines[i]!.trim());
    if (m) fields.set(m[1]!.trim(), m[2]!.trim());
  }
  return fields;
}

const PLACEHOLDER_RE = /^<.*>$/;

function checkMetadata(fields: Map<string, string>, required: string[], errors: string[]): void {
  for (const name of required) {
    const value = fields.get(name);
    if (value === undefined || value === "") {
      errors.push(`missing required metadata field: ${name}`);
      continue;
    }
    if (PLACEHOLDER_RE.test(value)) {
      // "Requirements Source" and similar fields explicitly allow the
      // literal value "n/a"; only an unfilled `<template>` token is an error.
      errors.push(`metadata field '${name}' still has an unfilled template value: ${value}`);
    }
  }
}

interface RawFinding {
  raw: string;
  area: string | null;
  prefix: string;
  num: number | null;
  line: number;
}

const FINDING_HEADER_RE = /^###\s+([^:]+):/;
/** `<PREFIX>-<N>` (single-lens/MFM/MST) or `<Area>/<PREFIX>-<N>` (implementation composite). */
const SIMPLE_ID_RE = /^([A-Z][A-Z]*)-(\d+)$/;
const COMPOSITE_ID_RE = /^([A-Za-z][A-Za-z ]*?)\/([A-Z][A-Z]*)-(\d+)$/;

/** Every `### <id>: <title>` header inside the `## Findings` section, parsed best-effort. */
function parseFindings(lines: string[], composite: boolean): RawFinding[] {
  const findings: RawFinding[] = [];
  let inFindings = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^##\s+Findings\s*$/.test(line.trim())) {
      inFindings = true;
      continue;
    }
    if (inFindings && /^##\s+\S/.test(line)) {
      inFindings = false;
      continue;
    }
    if (!inFindings) continue;
    const m = FINDING_HEADER_RE.exec(line.trim());
    if (!m) continue;
    const idText = m[1]!.trim();
    if (composite) {
      const cm = COMPOSITE_ID_RE.exec(idText);
      if (cm) {
        findings.push({ raw: idText, area: cm[1]!.trim(), prefix: cm[2]!, num: Number(cm[3]), line: i + 1 });
      } else {
        findings.push({ raw: idText, area: null, prefix: "", num: null, line: i + 1 });
      }
    } else {
      const sm = SIMPLE_ID_RE.exec(idText);
      if (sm) {
        findings.push({ raw: idText, area: null, prefix: sm[1]!, num: Number(sm[2]), line: i + 1 });
      } else {
        findings.push({ raw: idText, area: null, prefix: "", num: null, line: i + 1 });
      }
    }
  }
  return findings;
}

function checkFindingIds(
  findings: RawFinding[],
  family: FamilyConfig,
  composite: boolean,
  errors: string[],
): void {
  const seen = new Map<string, number>();
  const byGroup = new Map<string, number[]>();

  for (const f of findings) {
    if (f.num === null) {
      errors.push(`L${f.line}: finding id '${f.raw}' is not in the expected format`);
      continue;
    }
    if (f.prefix.startsWith("SONAR")) {
      errors.push(`L${f.line}: raw '${f.raw}' is not an executable finding id - normalize SonarQube output to a supported source-qualified id first`);
      continue;
    }

    if (composite) {
      const areaEntry = AREA_PREFIX.find((a) => a.area === f.area);
      if (!areaEntry) {
        errors.push(`L${f.line}: '${f.area}' is not a recognized Area (expected one of ${AREA_PREFIX.map((a) => a.area).join(", ")})`);
        continue;
      }
      if (areaEntry.prefix !== f.prefix) {
        errors.push(`L${f.line}: '${f.raw}' mixes Area '${f.area}' with prefix '${f.prefix}' (expected '${areaEntry.prefix}-N')`);
        continue;
      }
    } else if (family.prefix !== null && f.prefix !== family.prefix) {
      errors.push(`L${f.line}: '${f.raw}' uses prefix '${f.prefix}', expected '${family.prefix}-N' for this report family`);
      continue;
    }

    const key = composite ? `${f.area}/${f.prefix}` : f.prefix;
    const prior = seen.get(f.raw);
    if (prior !== undefined) {
      errors.push(`L${f.line}: duplicate finding id '${f.raw}' (first seen at L${prior})`);
    } else {
      seen.set(f.raw, f.line);
    }
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(f.num);
  }

  for (const [key, nums] of byGroup) {
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    for (let expected = 1; expected <= sorted[sorted.length - 1]!; expected++) {
      if (!sorted.includes(expected)) {
        errors.push(`${key} finding numbering has a gap: missing ${key}-${expected} (present: ${sorted.map((n) => `${key}-${n}`).join(", ")})`);
      }
    }
  }
}

function detectFamily(fields: Map<string, string>): string | null {
  const workflow = fields.get("Workflow");
  if (!workflow) return null;
  for (const [name, cfg] of Object.entries(FAMILIES)) {
    if (cfg.workflow === workflow) return name;
  }
  return null;
}

interface CheckResult {
  errors: string[];
  warnings: string[];
  family: string | null;
  findingCount: number;
}

function check(reportPath: string, familyArg: string | null): CheckResult {
  const text = readFileSync(reportPath, "utf-8");
  const lines = splitLines(text);
  const errors: string[] = [];
  const warnings: string[] = [];

  const fields = parseMetadata(lines);
  const family = familyArg ?? detectFamily(fields);
  if (!family || !(family in FAMILIES)) {
    errors.push(
      `could not determine report family (pass --family or a recognized 'Workflow:' value); known families: ${Object.keys(FAMILIES).join(", ")}`,
    );
    return { errors, warnings, family: null, findingCount: 0 };
  }
  const cfg = FAMILIES[family]!;
  const composite = cfg.prefix === null;

  checkMetadata(fields, [...COMMON_METADATA, ...cfg.extraMetadata], errors);

  const declaredWorkflow = fields.get("Workflow");
  if (declaredWorkflow !== undefined && declaredWorkflow !== cfg.workflow) {
    errors.push(`Workflow field is '${declaredWorkflow}', expected '${cfg.workflow}' for family '${family}'`);
  }

  const findings = parseFindings(lines, composite);
  checkFindingIds(findings, cfg, composite, errors);

  return { errors, warnings, family, findingCount: findings.length };
}

const USAGE = "usage: validate_audit_report.ts [-h] [--family NAME] [--strict] <report.md>";
const HELP = `${USAGE}

Deterministic schema/ID checks for a saved audit report markdown file.

positional arguments:
  report.md    Path to a saved audit report markdown file

options:
  -h, --help     show this help message and exit
  --family NAME  One of: ${Object.keys(FAMILIES).join(", ")}
  --strict       Treat warnings as errors`;

interface Args {
  target: string | null;
  family: string | null;
  strict: boolean;
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\nvalidate_audit_report.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  let family: string | null = null;
  let strict = false;
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--family") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --family: expected one argument");
        return null;
      }
      family = argv[++i]!;
    } else if (a.startsWith("--family=")) {
      family = a.slice("--family=".length);
    } else if (a === "--strict") {
      strict = true;
    } else if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else if (a.startsWith("-") && a !== "-") {
      printUsageError(`unrecognized arguments: ${a}`);
      return null;
    } else {
      positionals.push(a);
    }
  }
  if (positionals.length !== 1) {
    printUsageError("exactly one report.md path is required");
    return null;
  }
  return { target: positionals[0]!, family, strict };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;

  if (!args.target || !existsSync(args.target)) {
    console.error(`validate_audit_report: report not found: ${args.target}`);
    return 2;
  }

  const { errors, warnings, family, findingCount } = check(args.target, args.family);
  for (const w of warnings) console.log(`  WARN  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  const fail = errors.length > 0 || (warnings.length > 0 && args.strict);
  console.log(
    `\nvalidate_audit_report: ${errors.length} error(s), ${warnings.length} warning(s), family=${family ?? "unknown"}, findings=${findingCount} in ${args.target}`,
  );
  return fail ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}

export { check, FAMILIES, AREA_PREFIX, parseFindings, splitLines };
export type { RawFinding };
