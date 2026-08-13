/**
 * @massa-ai/web-ui — entrypoint module (type-check anchor).
 *
 * The browser bundle is `src/static/` (`index.html`, `styles.css`, and 22
 * TypeScript modules compiled by `tsc -p tsconfig.build.json`). `bun run
 * build` emits the compiled JavaScript plus both static assets into
 * `dist/static/`, which the Tools API serves verbatim at `/ui/*` (see
 * `apps/tools-api/src/routes/web-ui.ts`). Every file under `src/static/` is
 * real, strict-mode TypeScript and is type-checked along with the rest of
 * this package — there is no `allowJs`/`checkJs` interop path left. This
 * file only exists so `tsc --noEmit` has a package-root TS input to target;
 * no runtime code is exported from it — it is a static asset root, not an
 * importable module.
 */

export const WEB_UI_PACKAGE_MARKER = "@massa-ai/web-ui";
