# Code Annotation And Test Coverage

Use in every implementation workflow, before writing or editing
source. Defines the three things every created or updated unit of code owes
the next reader: an API doc block, a rationale comment, and a test.

## Principle

The next person to open this code — often a future agent with none of this
session's context — must be able to answer three questions from the file alone:
what does it do, why does it exist in this shape, and how do I prove it still
works. Doc blocks answer the first, rationale comments the second, tests the
third. None substitutes for another.

## 1. API Doc Block

Every **created or updated** public class, method, exported function, and public
type gets a language-native documentation block. "Updated" is the trigger too:
if the behavior changed, the doc that described the old behavior is now wrong.

| Language | Syntax | Notes |
| --- | --- | --- |
| Java | JavaDoc `/** */` | `@param`, `@return`, `@throws` |
| Kotlin | KDoc `/** */` | `@param`, `@return`, `@throws`, `@sample` |
| TypeScript / JavaScript | TSDoc `/** */` | `@param`, `@returns`, `@throws`; no redundant types |
| Python | docstring `"""..."""` | follow the project's existing convention (Google / NumPy / reST) |
| Swift | `///` | `- Parameter`, `- Returns`, `- Throws` |
| Rust | `///` and `//!` | `# Arguments`, `# Returns`, `# Panics`, `# Examples` |
| Go | `// Name ...` above the declaration | starts with the identifier name |
| C# | `///` XML | `<summary>`, `<param>`, `<returns>` |
| Ruby | YARD `#` | `@param`, `@return`, `@raise` |
| PHP | PHPDoc `/** */` | `@param`, `@return`, `@throws` |
| Shell | header comment block | usage, arguments, exit codes |
| SQL | `--` header | purpose, inputs, side effects |

Rules:

- Match the file's existing style. A repo that uses one-line docstrings does not
  want a Google-format block bolted onto one function.
- Document the **contract**: inputs, output, errors, side effects, and any
  invariant a caller must hold. Not the line-by-line implementation.
- Do not restate what the signature already says. `@param userId The user id` is
  noise; `@param userId Must be an active account; throws for soft-deleted users`
  is a contract.
- Private helpers need a doc block only when their contract is non-obvious.

## 2. Rationale Comment

Doc blocks describe the contract, not why the code changed. Add
a rationale block once at the changed unit — the class, the method, or the
enclosing block — not on every line.

The three required fields:

```
// Why: <the problem this solves, or the bug it fixes>
// Impacts: <the feature, requirement ID, or user-visible behavior it serves>
// Test: <the exact command or test name that exercises it>
```

Worked example:

```ts
/**
 * Resolves the effective vector store for a project.
 *
 * @param projectId - Project whose store is requested.
 * @returns The configured store, or the in-memory fallback when pgvector is unreachable.
 * @throws {ConfigError} When the project id is unknown.
 */
// Why: cold-start indexing crashed when pgvector was still booting, so the
//      factory must degrade instead of throwing.
// Impacts: WHO-R9 offline-first indexing; affects `index` and `reindex`.
// Test: bun test packages/core/src/__tests__/vector-store-factory.test.ts -t "falls back"
export function getVectorStore(projectId: string): VectorStore {
```

Use the project's own comment syntax. Keep each field to one line where possible;
`Why` may run to two when the cause is genuinely non-obvious. If the answer to
`Why` is "the spec said so", cite the requirement ID — that *is* the reason.

## 3. Tests

Every created or updated code path gets test coverage. Not "the module has
tests" — the specific path you changed.

| Change | Required coverage |
| --- | --- |
| New function/class | Happy path, each error path, and the boundary of every documented constraint |
| Changed behavior | A test that fails against the old behavior and passes against the new one |
| Bug fix (`debug`, `*-fix`) | A regression test at the seam closest to the root cause, written so it **fails before the fix** and passes after |
| New branch in existing code | One case per branch, including the default/else |
| Deleted code | Assert the removal where the absence is observable; delete only the tests that tested the deleted contract |

Rules:

- Tests assert **spec-defined outcomes**, never the implementation's own shape.
  A test that mirrors the code cannot detect that the code is wrong.
- For a bug fix, run the new test against the unfixed code first. A regression
  test that has never been red proves nothing.
- Never weaken, skip, delete, or `.only`-narrow an existing test to make a gate
  pass. If an existing test now fails, either the change is wrong or the test
  encoded the bug — decide which, and say which.
- If no valid test seam exists, document why in the completion report rather
  than silently shipping untested code.

### Exception — data and domain models are not unit-tested

Data models and anemic domain models carry state, not behavior. A unit test
that constructs them and asserts their own getters, setters, fields, or
constructor defaults mirrors the implementation and cannot detect the
model is wrong — the "test that mirrors the code" anti-pattern from the
rule above. **Do not write unit tests for these kinds:**

- **Data models** — persistence-layer entities: ORM-mapped classes, database
  schema-mapped types, Prisma/TypeORM/Entity Framework/Hibernate/JPA entities,
  SQL row types, and repository entity structs.
- **Anemic domain models** — DDD value objects and domain entities whose public
  surface is fields, accessors, and constructors with no meaningful behavior
  (no invariants, no state transitions, no domain rules).

This applies across every language the workflows touch (TypeScript/JavaScript,
Kotlin, Swift, Java, Python, Go, Rust, C#, Ruby, PHP, SQL). Test the **behavior**
that uses the model at the seam where it lives — the repository, service,
use-case, or mapper that creates, validates, persists, or transforms it.

This exception does **not** weaken the "test every changed code path" rule for
code that has behavior. A model with invariants, validation, state machines, or
domain rules is not anemic — test those rules at the model or the seam that
exercises them, wherever the contract is observable. When unsure whether a model
is anemic, the test is: "does this type have a method whose outcome is not fully
determined by its inputs and field assignments?" If yes, it has behavior; test
it. If no, it is a data model; test its consumers instead.

## Completion Evidence

Report, per changed unit: doc block present (yes / not-applicable-because), the
rationale block's `Test:` command, and the test names added or updated with
their pass/fail transition for bug fixes.
