# ============================================================
#  massa-ai — Docker remote-address probe image (T7 / SEC-06)
#
#  Build context is scripts/docker/. Built and run only by
#  scripts/tests/test-docker-remote-address.sh; never published, never part of
#  the api/mcp image chain in the root Dockerfile.
#
#  Same base and same elysia/@elysiajs/node majors as apps/tools-api, so the
#  address-reporting mechanism under test is the one the API actually runs.
# ============================================================

FROM oven/bun:1.3.14-alpine

WORKDIR /probe

# Pinned to the majors apps/tools-api/package.json declares. `request.ip` is an
# undocumented srvx getter reached through @elysiajs/node — measuring it under
# a different major would measure a different mechanism.
RUN bun add elysia@^1.2.25 @elysiajs/node@^1.2.0

COPY remote-address-probe.ts ./probe.ts

EXPOSE 3333

CMD ["bun", "./probe.ts"]
