#!/usr/bin/env bun
/**
 * Validate a skill folder against Skill Architect requirements.
 *
 * Usage:
 *   bun scripts/validate_skill.ts <path-to-skill-folder>
 *   bun scripts/validate_skill.ts <path-to-skill-folder> --format json
 *   bun scripts/validate_skill.ts <path-to-skill-folder> --json-out /tmp/skill-report.json
 *
 * Exit codes:
 *   0 = pass (warnings allowed)
 *   1 = fail (at least one error)
 *
 * Token-efficient workflow: run once with --json-out, then reuse the saved
 * JSON for feedback/review without re-running validation.
 *
 * TypeScript port of the former validate_skill.py (Skill Architect,
 * Useful-Agent-Skills). Frontmatter is parsed with Bun's built-in real YAML
 * parser (`Bun.YAML.parse`) — same precedent as
 * scripts/__tests__/workflow-bun-cache.test.ts — so the Python version's
 * PyYAML/stdlib fallback split is gone.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";

type Severity = "error" | "warning";

interface Check {
  name: string;
  passed: boolean;
  message: string;
  severity: Severity;
}

interface Results {
  path: string;
  checks: Check[];
  passed: number;
  failed: number;
  warnings: number;
  parser_mode: string;
  next_steps: string[];
  summary?: string;
}

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;

export function validateSkill(skillPath: string): Results {
  const results: Results = {
    path: skillPath,
    checks: [],
    passed: 0,
    failed: 0,
    warnings: 0,
    parser_mode: "unknown",
    next_steps: [],
  };

  const addCheck = (name: string, passed: boolean, message: string, severity: Severity = "error") => {
    results.checks.push({ name, passed, message, severity });
    if (passed) results.passed += 1;
    else if (severity === "warning") results.warnings += 1;
    else results.failed += 1;
  };

  // --- Check 1: Folder exists ---
  if (!existsSync(skillPath) || !statSync(skillPath).isDirectory()) {
    addCheck("folder_exists", false, `Path is not a directory: ${skillPath}`);
    results.summary = "FAIL — folder not found";
    return results;
  }
  addCheck("folder_exists", true, "Skill folder exists");

  // --- Check 2: Folder name is kebab-case ---
  const folderName = path.basename(path.normalize(skillPath));
  const isKebab = KEBAB_RE.test(folderName);
  addCheck("folder_kebab_case", isKebab, `Folder name '${folderName}' ${isKebab ? "is" : "is NOT"} kebab-case`);

  // --- Check 3: SKILL.md exists (exact casing) ---
  const entries = readdirSync(skillPath);
  const hasSkillMd = entries.includes("SKILL.md");
  addCheck("skill_md_exists", hasSkillMd, hasSkillMd ? "SKILL.md exists" : "SKILL.md not found (case-sensitive)");

  const wrongCasings = entries.filter((e) => e.toLowerCase() === "skill.md" && e !== "SKILL.md");
  if (wrongCasings.length > 0) {
    addCheck("skill_md_casing", false, `Found wrong casing: ${wrongCasings[0]} (must be exactly SKILL.md)`);
  }

  if (!hasSkillMd) {
    results.summary = "FAIL — SKILL.md not found";
    return results;
  }

  // --- Check 4: No README.md ---
  const hasReadme = entries.some((e) => e.toLowerCase() === "readme.md");
  addCheck(
    "no_readme",
    !hasReadme,
    hasReadme ? "README.md found — remove it (skills are for agents, not humans)" : "No README.md in skill folder",
  );

  // --- Check 5: Parse frontmatter ---
  const content = readFileSync(path.join(skillPath, "SKILL.md"), "utf8");
  const fmMatch = FRONTMATTER_RE.exec(content);
  if (!fmMatch) {
    addCheck("frontmatter_delimiters", false, "Missing or malformed --- delimiters in frontmatter");
    results.summary = "FAIL — frontmatter parse error";
    return results;
  }
  addCheck("frontmatter_delimiters", true, "YAML frontmatter delimiters present");

  let fm: Record<string, unknown>;
  try {
    const parsed = Bun.YAML.parse(fmMatch[1]);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Frontmatter is not a YAML mapping");
    }
    fm = parsed as Record<string, unknown>;
    results.parser_mode = "bun-yaml";
    addCheck("frontmatter_valid_yaml", true, "Frontmatter is valid YAML (parsed with Bun.YAML)");
  } catch (e) {
    addCheck("frontmatter_valid_yaml", false, `YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
    results.summary = "FAIL — YAML parse error";
    return results;
  }

  // --- Check 6: name field ---
  const name = fm.name;
  if (!name) {
    addCheck("name_present", false, "Missing 'name' field in frontmatter");
  } else {
    addCheck("name_present", true, `name: ${name}`);
    const isNameKebab = KEBAB_RE.test(String(name));
    addCheck("name_kebab_case", isNameKebab, `name '${name}' ${isNameKebab ? "is" : "is NOT"} kebab-case`);

    const nameLower = String(name).toLowerCase();
    const hasReserved = nameLower.includes("claude") || nameLower.includes("anthropic");
    addCheck(
      "name_not_reserved",
      !hasReserved,
      hasReserved ? "Name contains 'claude' or 'anthropic' (reserved)" : "Name does not use reserved terms",
    );

    const namesMatch = String(name) === folderName;
    addCheck(
      "name_matches_folder",
      namesMatch,
      namesMatch
        ? `name '${name}' matches folder '${folderName}'`
        : `name '${name}' does NOT match folder '${folderName}'`,
      "warning",
    );
  }

  // --- Check 7: description field ---
  const desc = fm.description;
  if (!desc) {
    addCheck("description_present", false, "Missing 'description' field in frontmatter");
  } else {
    const descStr = String(desc).trim();
    addCheck("description_present", true, `description present (${descStr.length} chars)`);

    addCheck("description_length", descStr.length <= 1024, `Description length: ${descStr.length}/1024 chars`);

    const hasXml = descStr.includes("<") || descStr.includes(">");
    addCheck(
      "description_no_xml",
      !hasXml,
      hasXml ? "XML angle brackets found in description (forbidden)" : "No XML brackets in description",
    );

    const triggerKeywords = ["use when", "use for", "use this", "trigger", "ask for", "asks to", "says", "mentions"];
    const descLower = descStr.toLowerCase();
    const hasTriggers = triggerKeywords.some((kw) => descLower.includes(kw));
    addCheck(
      "description_has_triggers",
      hasTriggers,
      hasTriggers
        ? "Description includes trigger guidance"
        : "Missing trigger phrases — add 'Use when...' guidance (mandatory per CONTRIBUTING.md)",
    );

    const negativeKeywords = ["do not use", "don't use", "not for", "not intended for"];
    const hasNegativeScope = negativeKeywords.some((kw) => descLower.includes(kw));
    addCheck(
      "description_has_negative_scope",
      hasNegativeScope,
      hasNegativeScope
        ? "Description includes negative scope"
        : "Missing negative scope — add 'Do NOT use for...' guidance (mandatory per CONTRIBUTING.md)",
    );
  }

  // --- Check 7b: metadata field ---
  const metadata = fm.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    addCheck(
      "metadata_present",
      false,
      "Missing 'metadata' field in frontmatter (expected metadata.version and metadata.author)",
      "warning",
    );
  } else {
    addCheck("metadata_present", true, "metadata field present");
    const meta = metadata as Record<string, unknown>;

    const metaVersion = meta.version;
    addCheck(
      "metadata_version",
      Boolean(metaVersion),
      metaVersion ? `metadata.version: ${metaVersion}` : "Missing metadata.version",
      "warning",
    );

    const metaAuthor = meta.author;
    addCheck(
      "metadata_author",
      Boolean(metaAuthor),
      metaAuthor ? `metadata.author: ${metaAuthor}` : "Missing metadata.author",
      "warning",
    );
  }

  // --- Check 8: Body content ---
  const body = content.slice(fmMatch[0].length);
  const lineCount = body.trim().split("\n").length;
  addCheck(
    "body_line_count",
    lineCount <= 500,
    `SKILL.md body: ${lineCount} lines ${lineCount <= 500 ? "(good)" : "(consider moving content to references/)"}`,
    lineCount > 500 ? "warning" : "error",
  );

  const hasExamples = /(example|user says|result:)/i.test(body);
  addCheck(
    "body_has_examples",
    hasExamples,
    hasExamples ? "Instructions include examples" : "Consider adding usage examples",
    "warning",
  );

  const hasErrorHandling = /(error|fail|troubleshoot|issue|problem|if.*fails)/i.test(body);
  addCheck(
    "body_has_error_handling",
    hasErrorHandling,
    hasErrorHandling ? "Instructions include error handling" : "Consider adding error handling guidance",
    "warning",
  );

  // --- Check 9: Optional files ---
  const refsDir = path.join(skillPath, "references");
  if (entries.includes("references") && existsSync(refsDir) && statSync(refsDir).isDirectory()) {
    for (const ref of readdirSync(refsDir)) {
      const refMentioned = body.includes(ref) || body.includes(`references/${ref}`);
      addCheck(
        `ref_linked_${ref}`,
        refMentioned,
        refMentioned
          ? `references/${ref} is referenced in SKILL.md`
          : `references/${ref} exists but is not referenced in SKILL.md`,
        "warning",
      );
    }
  }

  // --- Summary ---
  if (results.failed === 0) {
    results.summary =
      `PASS — ${results.passed} checks passed` + (results.warnings > 0 ? `, ${results.warnings} warnings` : "");
  } else {
    results.summary = `FAIL — ${results.failed} errors, ${results.warnings} warnings`;
    results.next_steps = results.checks
      .filter((c) => !c.passed && c.severity === "error")
      .map((c) => `Fix check '${c.name}': ${c.message}`);
  }

  return results;
}

function printReport(results: Results, verbose: boolean): void {
  const bar = "=".repeat(60);
  const line = "─".repeat(60);
  console.log(`\n${bar}`);
  console.log("  Skill Validation Report");
  console.log(`  Path: ${results.path}`);
  console.log(`  Parser: ${results.parser_mode}`);
  console.log(`${bar}\n`);

  for (const check of results.checks) {
    if (check.passed && !verbose) continue;
    const icon = check.passed ? "✅" : check.severity === "warning" ? "⚠️" : "❌";
    console.log(`  ${icon} ${check.name}: ${check.message}`);
  }

  console.log(`\n${line}`);
  console.log(`  ${results.summary}`);
  console.log(`  Passed: ${results.passed} | Failed: ${results.failed} | Warnings: ${results.warnings}`);
  console.log(`${line}\n`);

  if (results.next_steps.length > 0) {
    console.log("  Next steps:");
    results.next_steps.forEach((step, i) => console.log(`    ${i + 1}. ${step}`));
    console.log("");
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  let skillPath: string | undefined;
  let format: "human" | "json" | "both" = "human";
  let verbose = false;
  let prettyJson = false;
  let jsonOut: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--format") {
      const v = args[++i];
      if (v !== "human" && v !== "json" && v !== "both") {
        console.error(`Invalid --format: ${v} (choose human|json|both)`);
        process.exit(2);
      }
      format = v;
    } else if (a === "--verbose") verbose = true;
    else if (a === "--pretty-json") prettyJson = true;
    else if (a === "--json-out") jsonOut = args[++i];
    else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: bun scripts/validate_skill.ts <path> [--format human|json|both] [--verbose] [--pretty-json] [--json-out FILE]\n" +
          "Tip: use --json-out FILE to save full results and avoid re-running for later feedback.",
      );
      process.exit(0);
    } else if (!a.startsWith("-") && skillPath === undefined) skillPath = a;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }

  if (!skillPath) {
    console.error("Missing required argument: path to the skill folder");
    process.exit(2);
  }

  const results = validateSkill(skillPath);
  const reportJson = JSON.stringify(results, null, prettyJson ? 2 : undefined);

  if (format === "human" || format === "both") {
    printReport(results, verbose);
    if (!jsonOut) console.log("  Tip: add --json-out FILE to reuse this report without re-running.\n");
  }
  if (format === "json" || format === "both") {
    if (format === "both") console.log("--- JSON Report ---");
    console.log(reportJson);
  }
  if (jsonOut) {
    writeFileSync(jsonOut, reportJson);
    if (format === "human" || format === "both") console.log(`  JSON report saved to: ${jsonOut}`);
  }

  process.exit(results.failed === 0 ? 0 : 1);
}
