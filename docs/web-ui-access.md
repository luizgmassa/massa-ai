# Web UI access and its limits

The Tools API requires an `x-api-key` on every route except `/health`, `/swagger`
and `/ui`. The dashboard at `/ui` is a static bundle with no login, so the server
stamps the key into `index.html` for callers it trusts, and `app.js` reads it
back out of a `<meta name="massa-ai-api-key">` tag. An untrusted caller gets the
same shell with no key, a `<meta name="massa-ai-access" content="configure">`
marker, and a visible banner; that page issues no authenticated call.

## Who is trusted

A caller is trusted when either holds:

1. Its address is loopback — `::1`, `::ffff:127.0.0.1`, or anything in
   `127.0.0.0/8`. All three spellings matter: `localhost` resolves to `::1`
   while an explicit `127.0.0.1` arrives IPv4-mapped.
2. `MASSA_AI_WEB_UI_TRUST_LOCAL=true` is set, which trusts everyone.

The address comes from `ctx.request.ip`. Under `adapter: node()` that is the only
readable source — `ctx.server` is absent, so Elysia's documented
`server.requestIP()` is `undefined` there. This was verified empirically against
a booted server; see
`.specs/features/audit-remediation-2026-07/design.md` → "TASK-000 — remote-address
spike result".

## Known limitations

These are properties of the design, not bugs. Each one is covered by a test that
asserts the actual behavior rather than the hoped-for one.

### A reverse proxy that terminates on loopback looks local

If nginx, Caddy, or an SSH tunnel terminates the connection and forwards to the
API over `127.0.0.1`, the API sees loopback and injects the key. Every client of
that proxy therefore receives it, including remote ones.

`X-Forwarded-For` is deliberately **not** consulted: it is caller-supplied, so
trusting it would let any client claim to be local. There is no configuration
that makes a proxied deployment safe here.

**If you put the API behind a proxy, set `MASSA_AI_WEB_UI_TRUST_LOCAL=false` and
distribute the key out of band.** With the flag false and a proxy in front, `/ui`
serves the configure-access state to everyone, which is the intended outcome —
the dashboard is not usable through a proxy without handing out the key.

### Docker cannot satisfy the loopback check

`docker-compose.yml` publishes `3333:3333`. A browser on the host reaches the
container through the bridge, so the container sees a bridge address such as
`::ffff:172.17.0.1` — correctly, that is genuinely the peer. The loopback check
can never pass, and without an override the dashboard would be permanently
unusable in the one deployment the install docs describe.

The image therefore sets `MASSA_AI_WEB_UI_TRUST_LOCAL=true`. The cost is real:
combined with the `0.0.0.0` bind, anyone who can reach the published port can
load `/ui` and read the key out of the HTML.

Mitigations, in order of preference:

- Publish the port to loopback only: `ports: ["127.0.0.1:3333:3333"]`.
- Set `MASSA_AI_WEB_UI_TRUST_LOCAL=false` and read `security.apiKey` from the
  mounted `config.json` yourself. `/ui` will show the configure-access state.
- Keep the container off untrusted networks.

The API logs one warning at startup whenever the override is on.

### The key is in the page source

On a trusted caller the key is plain text in the HTML. Anything that can read
the page can read the key: a browser extension, a screen share, a saved copy, a
`view-source`. This is the accepted cost of having no login surface. Rotate by
editing `security.apiKey` in `~/.config/massa-ai/config.json` and restarting.

### `/config/reveal` escalates the exposure (S2, APCR-08)

With `MASSA_AI_WEB_UI_TRUST_LOCAL=true` (the Docker default — see above),
`GET /api/v1/config/reveal` hands **plaintext** `database.url` and every
configured API key (`security.apiKey`, `llm.apiKey`, `embedding.apiKey`) to
any caller that can reach the port. Before this route existed the same
exposure only ever leaked masked values (`"***"`); this route is the
plaintext path.

`/config/reveal` carries **no protection beyond** the already-accepted `/ui`
key-injection chain described above. It is not in `PUBLIC_PATHS`, so it is
authenticated like every other route — but the key that authenticates it is
the exact key `/ui` already handed the caller. "Authenticated" here should
not be read as "mitigated": anyone who could read the key out of the page
source could always call this route with it.

### Rotating a key does not purge old backups

Every save through the Config tab writes a timestamped backup
(`config.json.bak.<ISO>`) before overwriting `config.json`, capped at the 10
most recent. Rotating `security.apiKey`, `llm.apiKey`, `embedding.apiKey`, or
`database.url` does **not** purge the backups that predate the rotation — up
to 10 files can retain the previous secret, at mode `0600`, until they age out
of the cap on a later save. "Bounded in number" caps disk growth; it does not
bound how long a rotated secret stays readable on disk.

## Turning the dashboard off

`WEB_UI_ENABLED=false` makes `/ui` return 404 entirely. Nothing is served and no
key is injected.
