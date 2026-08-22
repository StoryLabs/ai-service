# Changelog

## 0.1.7 — 2026-08-21
- Fix Muse: `MUSE_URL` -> `https://api.meta.ai/v1/chat/completions` (real, verificado `curl https://api.meta.ai/v1/models` + `chat/completions` pong), payload `max_completion_tokens` (no `max_tokens`), omite `top_k`/`stop` (400 en Muse Spark), `safety_identifier` para `userId`, `temperature` default `1.0` per docs (tuned to 1.0)

## 0.1.6 — 2026-08-21
- Fix: `MUSE_MODELS.SPARK` vuelve a `'muse-spark-1.2-contributor'` (modelo real), `LLM_1751420409235724_4VRvEUuB8UJRvaAMotFs0f66XpU` es `MUSE_API_KEY` (credencial, no modelo) — corrige payload `model`

## 0.1.5 — 2026-08-21
- Clean: evita Spanglish en variables — `TOPE_POR_DEFECTO`→`FALLBACK_MAX_TOKENS`, `topeDeRespuesta`→`resolveMaxTokens`, `esTransitorio`→`isTransient`, `esContextoExcedido`→`isContextExceeded`, `clasificarFallo`→`classifyFailure`, `ESPERA_BASE_MS`→`BASE_RETRY_DELAY_MS`, `MAX_INTENTOS`→`MAX_RETRIES`, `DeepSeekContextoExcedidoError`→`DeepSeekContextExceededError` (mismos para Muse). Comentarios y explicaciones siguen en español.

## 0.1.4 — 2026-08-21
- Refactor: extrae `src/retry.js` helper reutilizable `createClasificarFallo` para DeepSeek y Muse (mismo backoff 3×1s/2s, MOT-AI-011/013/014), cada adapter mantiene su `esTransitorio`/`esContextoExcedido`/`parseUsage`/`MAX_TOKENS`

## 0.3.0 — 2026-08-21
- BREAKING: `MODELS.NORMAL` -> `MODELS.FLASH` (`'deepseek-v4-flash'`). Frontend sigue mandando `modo: 'NORMAL'` pero `ai-service` expone nombre real `FLASH` (clean). `bookingAPI` mapea `modo === 'PRO' ? MODELS.PRO : MODELS.FLASH`.

## 0.2.0 — 2026-08-21
- BREAKING clean: `MODELOS`/`MODELOS_MUSE` removed, solo `MODELS`/`MUSE_MODELS` (clientes deben adaptar `import {MODELS}` )
- `callAI({logger})` requerido sin fallback ya en 0.1.1

## 0.1.1 — 2026-08-21
- Muse via fetch POST https://api.muse.example.com/v1/chat/completions, model LLM_1751420409235724_4VRvEUuB8UJRvaAMotFs0f66XpU, usage mapping input_tokens/output_tokens
- 11-key config parametrizable desde cliente: temperature(0..2), maxTokens, timeoutMs, topP(0..1), topK(>=1), presencePenalty(-2..2), frequencyPenalty(-2..2), stop, seed, responseFormat, includeRaw — validación estricta MOT-AI-016
- Logger sin fallback: callAI({logger}) requerido, lanza MOT-AI-010 si falta (src/logger.js)
- DeepSeek payload con top_p/top_k/presence_penalty etc. passthrough

## 0.1.0 — 2026-08-21
- Initial release: callAI({messages|prompts, model, config, userId, provider?}) → NormalizedResult
- Adapter DeepSeek (port fiel de bookingAPI/src/util/deepseekClient.js) — MODELS.FLASH/PRO, MAX_TOKENS 6000/8000/fallback 4000, DEFAULT_TIMEOUT_MS 180_000, AbortController, reintentos 429/5xx con backoff ESPERA_BASE_MS*(MAX_INTENTOS - intentos +1), DeepSeekContextExceededError, parseUsage normalizado
- Adapter Muse Spark (stub, contrato definido) — MUSE_MODELS.SPARK, soporta MUSE_API_KEY || MUSE_CONTRIBUTOR_TOKEN, stub accionable sin fetch
- Registry, error taxonomy MOT-AI-01x (AIError, ContextExceededError, DeepSeekContextExceededError, TimeoutError, UnknownModelError, ProviderNotRegisteredError, HTTPError, StreamingNotSupportedError), credential isolation trim() fail-fast
- Config defaults centralizados applyDefaults
- ESM, Node >=18, GitHub Packages @cachac, exports explícito
- Streaming: capítulo investigado (SSE vs chunked vs ReadableStream, Hono/Express/Nuxt proxy), stub StreamingNotSupportedError, firma Chunk y callAI.stream()
