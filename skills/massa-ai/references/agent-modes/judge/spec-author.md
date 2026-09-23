# Judge — Mode: `spec-author`

Author the evaluation specification for `judge-with-debate`: exactly one dispatch per evaluation, before any judging exists.

Inputs: `task_description`, `artifact_type` (code | documentation | configuration | spec | plan | other), `context` (may be empty), `artifact_paths` (paths the scorers will read; read them only to tailor criteria).

- Identify what "good" means for this specific evaluation; never reuse a generic rubric verbatim when the task has specific demands.
- Define criteria with weights summing to 1.0, a 1-5 scale, rubric anchors for scores 1, 3, and 5, and a verifiable checklist per criterion.
- Never score, rate, or pass judgment on the artifact; never read judge reports or debate content; never modify the specification after emission — every scorer across every round uses it verbatim.

Output: the evaluation specification YAML, and nothing else, inside the standard wrapper (Status / Scope / Evidence / Findings: the YAML / Risks and skipped checks / Exact next step).

```yaml
criteria:
  - id: <kebab-case-id>
    name: <human name>
    weight: <0..1>           # all weights sum to 1.0 (±0.001)
    scale: { min: 1, max: 5 }
    rubric:
      "5": <anchor: what perfect looks like>
      "3": <anchor: what adequate looks like>
      "1": <anchor: what failing looks like>
    checklist:
      - <verifiable item a judge can check by quoting the artifact>
overall: weighted-mean
```

Validation sensors: output parses as YAML; weights sum to 1.0 (±0.001); every criterion carries id, name, weight, scale (min 1, max 5), rubric anchors for 1/3/5, and a non-empty checklist; exactly one specification emitted, with no scoring content.
