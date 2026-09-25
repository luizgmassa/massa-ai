#!/usr/bin/env python3
"""OpenAI-compatible /v1/embeddings for an MLX embedding model on Apple Silicon.

Why this exists: LM Studio cannot serve an MLX embedding build. It types a model
by architecture, and `mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ` is
`Qwen3ForCausalLM`, so LM Studio types it `llm`. Its /v1/embeddings endpoint
serves whatever model is typed `embeddings` and ignores the request's `model`
field entirely. Measured 2026-09-21 on a live install:

  - DWQ loaded as the ONLY model      -> HTTP 400 {"error":"No models loaded..."}
  - a nonexistent id, DWQ loaded      -> the identical HTTP 400
  - DWQ + the GGUF build both loaded  -> HTTP 200 with the GGUF's vector, byte
                                         for byte, whichever id was requested

That is upstream bug lmstudio-ai/lmstudio-bug-tracker#808 ("Qwen3 Models not
Recognized as Embedding Types for MLX Format"), open with no maintainer reply.
LM Studio's own text-embeddings docs only ever promise GGUF, and
`lms runtime get -l` offers exactly one MLX engine on macOS arm64 — `mlx-llm`,
an LLM engine. There is no MLX embedding engine to install.

None of that is a limitation of MLX. `mlx-embeddings` loads the same weights and
returns (n, 1024) already L2-normalized. This file is the adapter between them:
an OpenAI-shaped endpoint so `embedding.baseURL` can point at it and nothing
else in massa-ai has to know.

Usage:
    uv venv --python 3.12 ~/.config/massa-ai/mlx-embed
    VIRTUAL_ENV=~/.config/massa-ai/mlx-embed uv pip install mlx-embeddings
    ~/.config/massa-ai/mlx-embed/bin/python scripts/mlx-embedding-server.py

Environment:
    MASSA_AI_MLX_EMBED_MODEL  weights: a local directory or a Hugging Face repo
                              id (default: the LM Studio copy of the DWQ build,
                              so an existing install needs no second download)
    MASSA_AI_MLX_EMBED_ID     the id reported on /v1/models and echoed back
                              (default: qwen3-embedding-0.6b-dwq — the same id
                              the installer writes into config.json)
    MASSA_AI_MLX_EMBED_PORT   default 1235, one past LM Studio's 1234
    MASSA_AI_MLX_EMBED_HOST   default 127.0.0.1
    MASSA_AI_MLX_EMBED_MAX_TEXTS  request-size ceiling (default 256)
"""

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_WEIGHTS = os.path.expanduser(
    "~/.lmstudio/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ"
)

WEIGHTS = os.environ.get("MASSA_AI_MLX_EMBED_MODEL") or DEFAULT_WEIGHTS
MODEL_ID = os.environ.get("MASSA_AI_MLX_EMBED_ID") or "qwen3-embedding-0.6b-dwq"
PORT = int(os.environ.get("MASSA_AI_MLX_EMBED_PORT") or "1235")
HOST = os.environ.get("MASSA_AI_MLX_EMBED_HOST") or "127.0.0.1"

# Batches are chunked rather than passed whole: `input` is caller-controlled and
# massa-ai's embedding layer sends batchSize 64 by default, but a re-index can
# hand a much larger list, and one oversized MLX graph is an OOM rather than a
# slow request.
CHUNK = int(os.environ.get("MASSA_AI_MLX_EMBED_CHUNK") or "32")

# Hard ceiling on texts per request: CHUNK bounds the MLX graph, but a runaway
# client batch would still own the serialized inference queue for minutes.
# massa-ai's largest batches are 64 texts; anything larger is a caller bug.
MAX_TEXTS = int(os.environ.get("MASSA_AI_MLX_EMBED_MAX_TEXTS") or "256")

# Inference is serialized on purpose: concurrent generate() calls multiply MLX
# graphs in unified memory, and a batch that outlives the client timeout must
# queue behind its own retries instead of racing them. Racing is what ballooned
# a 3000-file index to 50GB on 2026-09-24 (the client aborts -> BrokenPipeError
# in the log while the aborted work kept running -> retry graphs stack on top).
_INFERENCE_LOCK = threading.Lock()

_model = None
_tokenizer = None


def _ensure_loaded():
    """Load once, on the first request rather than at import.

    Startup stays instant, so a health probe answers before the weights are
    resident — the installer can check the port is live without waiting on a
    335 MB load.
    """
    global _model, _tokenizer
    if _model is None:
        from mlx_embeddings import load

        _model, _tokenizer = load(WEIGHTS)
    return _model, _tokenizer


def embed(texts):
    """Embed a list of strings, returning a list of float lists.

    Serialized: one generate() at a time, model load included. Concurrent MLX
    graphs multiply wired-memory usage, and a batch that outlives the client
    timeout has to queue behind its own retries rather than race them.
    """
    import mlx.core as mx
    from mlx_embeddings import generate

    with _INFERENCE_LOCK:
        model, tokenizer = _ensure_loaded()
        out = []
        for start in range(0, len(texts), CHUNK):
            result = generate(
                model, tokenizer, texts=texts[start : start + CHUNK]
            )
            out.extend(result.text_embeds.tolist())
        # Hand cached Metal buffers back: the allocator keeps them for reuse,
        # and batch shapes vary (the tail chunk is len % CHUNK), so without an
        # explicit clear the cache grows for the life of the server. The
        # clear_cache helper moved off the metal submodule in newer MLX; use
        # whichever this install ships.
        clear_cache = getattr(mx, "clear_cache", None) or mx.metal.clear_cache
        clear_cache()
    return out


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, message):
        # OpenAI's error envelope, because that is what an OpenAI-compatible
        # client parses. A bare string body would read as a successful response
        # with an unexpected shape.
        self._send(status, {"error": {"message": message, "type": "invalid_request_error"}})

    def do_GET(self):
        if self.path.rstrip("/") in ("/v1/models", "/models"):
            self._send(
                200,
                {
                    "object": "list",
                    "data": [{"id": MODEL_ID, "object": "model", "owned_by": "mlx"}],
                },
            )
        elif self.path.rstrip("/") == "/health":
            self._send(200, {"status": "ok", "model": MODEL_ID, "loaded": _model is not None})
        else:
            self._error(404, f"unknown path {self.path}")

    def do_POST(self):
        if self.path.rstrip("/") not in ("/v1/embeddings", "/embeddings"):
            self._error(404, f"unknown path {self.path}")
            return

        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError as exc:
            self._error(400, f"invalid JSON body: {exc}")
            return

        raw = payload.get("input")
        if isinstance(raw, str):
            texts = [raw]
        elif isinstance(raw, list) and all(isinstance(t, str) for t in raw):
            texts = raw
        else:
            # Token-array input is part of OpenAI's schema and is deliberately
            # not supported: massa-ai never sends it, and accepting it silently
            # would mean embedding the string "[1, 2, 3]".
            self._error(400, "`input` must be a string or a list of strings")
            return
        if not texts:
            self._error(400, "`input` must not be empty")
            return
        if len(texts) > MAX_TEXTS:
            self._error(
                400,
                f"`input` accepts at most {MAX_TEXTS} texts, got {len(texts)}",
            )
            return

        try:
            vectors = embed(texts)
        except Exception as exc:  # noqa: BLE001 - surfaced to the caller as 500
            self._error(500, f"embedding failed: {exc}")
            return

        self._send(
            200,
            {
                "object": "list",
                "model": payload.get("model") or MODEL_ID,
                "data": [
                    {"object": "embedding", "index": i, "embedding": v}
                    for i, v in enumerate(vectors)
                ],
                # Token counts are not metered here. The field is present
                # because OpenAI clients read it; the zeros say "unmeasured"
                # rather than inventing a number.
                "usage": {"prompt_tokens": 0, "total_tokens": 0},
            },
        )

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def main():
    if not os.path.isdir(WEIGHTS) and "/" not in WEIGHTS:
        sys.exit(f"MASSA_AI_MLX_EMBED_MODEL is neither a directory nor a repo id: {WEIGHTS}")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    sys.stderr.write(f"mlx-embedding-server: {MODEL_ID} on http://{HOST}:{PORT}/v1\n")
    sys.stderr.write(f"  weights: {WEIGHTS}\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
