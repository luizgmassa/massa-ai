# ============================================
# massa-ai - Multi-stage Docker Build
# ============================================
# Targets:
#   api  - Tools API (ElysiaJS REST on :3333)
#   mcp  - MCP Client (stdio proxy to API)
#
# Usage:
#   docker compose up              # API + MCP
#   docker build --target api .    # API only
#   docker build --target mcp .    # MCP only
# ============================================

# ---- Base: install dependencies & build ----
FROM oven/bun:1.3.14-alpine AS base

# Node.js required by Prisma
RUN apk add --no-cache nodejs-current

WORKDIR /app

# Copy dependency manifests first (cache layer)
COPY package.json bun.lock turbo.json tsconfig.json bunfig.toml ./
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
COPY apps/tools-api/package.json apps/tools-api/
COPY apps/mcp-client/package.json apps/mcp-client/
COPY apps/opencode-plugin/package.json apps/opencode-plugin/

# Bun patchedDependencies (the tree-sitter prebuilt-binary patch) must be in
# the install context, or `bun install` fails resolving the patch file.
COPY patches ./patches

# Install dependencies (ignore Prisma postinstall that checks Node version)
RUN bun install --ignore-scripts

# Copy source code (plugins install separately).
# apps/web-ui ships no build step — tools-api reads its static/ dir verbatim at
# request time, so the sources must be present in the image or /ui returns 500.
COPY packages ./packages
COPY apps/tools-api ./apps/tools-api
COPY apps/web-ui ./apps/web-ui
COPY apps/mcp-client ./apps/mcp-client
COPY apps/opencode-plugin ./apps/opencode-plugin

# Generate Prisma client
RUN cd packages/core && bunx prisma generate

# Build everything
RUN bun run build

# ---- API Target ----
FROM oven/bun:1.3.14-alpine AS api

RUN apk add --no-cache nodejs-current curl

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/tools-api ./apps/tools-api
COPY --from=base /app/apps/web-ui ./apps/web-ui
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/bunfig.toml ./bunfig.toml

# Entrypoint: runs Prisma migrations before starting the API
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Data directory for non-database runtime artifacts
RUN mkdir -p /data

ENV NODE_ENV=production
ENV MASSA_AI_API_PORT=3333
# SEC-06: config.json is where SEC-01 persists the auto-provisioned API key,
# and its location is XDG-derived (packages/shared/src/config/xdg.ts). Left at
# the default it would land in the container's own /root/.config, which is NOT
# the volume docker-compose mounts — the key would be unreadable by the
# operator and regenerated on every `docker compose up --force-recreate`.
# Pointing XDG_CONFIG_HOME at /data puts config.json (and the default data dir)
# inside the mounted volume, which is what "auto-provision a key into its
# mounted data volume" requires.
ENV XDG_CONFIG_HOME=/data
# Default: Ollama on host network
ENV OLLAMA_BASE_URL=http://host.docker.internal:11434
ENV OLLAMA_EMBEDDING_MODEL=qwen3-embedding:4b
ENV OLLAMA_EMBEDDING_DIMENSIONS=2560
# SEC-05: a container reached through a bridge port mapping sees the host
# browser as a bridge address (::ffff:172.17.0.x), never as loopback, so the
# address check can never pass here and /ui would be permanently unusable.
# This opts the container in to serving the key in the page.
#
# It means EVERY caller that can reach this port gets the key, and the API binds
# 0.0.0.0 — publish the port only to a trusted network, or set
# MASSA_AI_WEB_UI_TRUST_LOCAL=false to disable /ui key injection entirely and
# read security.apiKey from the mounted config.json instead. The API logs a
# warning at startup while this is on.
ENV MASSA_AI_WEB_UI_TRUST_LOCAL=true

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -sf http://localhost:3333/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "./apps/tools-api/src/index.ts"]

# ---- MCP Target ----
FROM oven/bun:1.3.14-alpine AS mcp

RUN apk add --no-cache nodejs-current

WORKDIR /app

COPY --from=base /app ./

ENV NODE_ENV=production
# MCP client connects to the API container
ENV MASSA_AI_API_URL=http://massa-ai-api:3333
# SEC-06: that API now rejects unauthenticated requests, and api-client.ts:36
# reads the key from MASSA_AI_API_KEY. When the operator does not pin one,
# @massa-ai/shared's env.ts seeds it from config.json's security.apiKey — so
# this container has to resolve the same config the API provisioned into the
# shared /data volume. Without it every MCP call 401s on a default
# `docker compose up`.
ENV XDG_CONFIG_HOME=/data

# stdio transport - no ports exposed
CMD ["bun", "./apps/mcp-client/src/index.ts"]
