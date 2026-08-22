# Changelog

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
- Adapter DeepSeek (port fiel de bookingAPI/src/util/deepseekClient.js) — MODELS.FLASH/PRO, MAX_TOKENS 6000/8000/fallback 4000, DEFAULT_TIMEOUT_MS 180_000, AbortController, reintentos 429/5xx con backoff ESPERA_BASE_MS*(MAX_INTENTOS - intentos +1), DeepSeekContextoExcedidoError, parseUsage normalizado
- Adapter Muse Spark (stub, contrato definido) — MUSE_MODELS.SPARK, soporta MUSE_API_KEY || MUSE_CONTRIBUTOR_TOKEN, stub accionable sin fetch
- Registry, error taxonomy MOT-AI-01x (AIError, ContextExceededError, DeepSeekContextoExcedidoError, TimeoutError, UnknownModelError, ProviderNotRegisteredError, HTTPError, StreamingNotSupportedError), credential isolation trim() fail-fast
- Config defaults centralizados applyDefaults
- ESM, Node >=18, GitHub Packages @cachac, exports explícito
- Streaming: capítulo investigado (SSE vs chunked vs ReadableStream, Hono/Express/Nuxt proxy), stub StreamingNotSupportedError, firma Chunk y callAI.stream()
