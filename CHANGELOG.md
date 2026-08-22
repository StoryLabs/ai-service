# Changelog

## 0.1.0 — 2026-08-21
- Initial release: callAI({messages|prompts, model, config, userId, provider?}) → NormalizedResult
- Adapter DeepSeek (port fiel de bookingAPI/src/util/deepseekClient.js) — MODELOS.NORMAL/PRO, MAX_TOKENS 6000/8000/fallback 4000, DEFAULT_TIMEOUT_MS 180_000, AbortController, reintentos 429/5xx con backoff ESPERA_BASE_MS*(MAX_INTENTOS - intentos +1), DeepSeekContextoExcedidoError, parseUsage normalizado
- Adapter Muse Spark (stub, contrato definido) — MUSE_MODELS.SPARK, soporta MUSE_API_KEY || MUSE_CONTRIBUTOR_TOKEN, stub accionable sin fetch
- Registry, error taxonomy MOT-AI-01x (AIError, ContextExceededError, DeepSeekContextoExcedidoError, TimeoutError, UnknownModelError, ProviderNotRegisteredError, HTTPError, StreamingNotSupportedError), credential isolation trim() fail-fast
- Config defaults centralizados applyDefaults
- ESM, Node >=18, GitHub Packages @cachac, exports explícito
- Streaming: capítulo investigado (SSE vs chunked vs ReadableStream, Hono/Express/Nuxt proxy), stub StreamingNotSupportedError, firma Chunk y callAI.stream()
