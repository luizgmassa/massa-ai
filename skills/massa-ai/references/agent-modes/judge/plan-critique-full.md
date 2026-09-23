# Judge — Mode: `plan-critique` (depth: `full`)

Inputs (full only, in addition to the shared plan-critique inputs): `fool_mode` — the selected The Fool mode (`pre_mortem`, `red_team`, `evidence_audit`, `socratic`, or `dialectic`; distinct from the packet `mode`, which stays `plan-critique`) — plus its reference content. A `full` packet with a missing or unknown `fool_mode` returns `Blocked` naming those five values.

Output for `depth: full`:
- Status: Complete | Partial | Blocked
- Selected `fool_mode`
- Steelmanned thesis
- 3-5 strongest challenges
- Per challenge: severity (`critical` | `high` | `medium` | `low`), affected plan section, evidence gap or assumption at risk, required revision or accepted-risk framing
- Confidence impact
- Risks and skipped checks
- Exact next step
