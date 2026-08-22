# @cachac/ai-service

Centralized AI service — unified `callAI` across DeepSeek, Muse Spark and future providers.

ESM-only, Node >=18, zero runtime dependencies, published to GitHub Packages (`https://npm.pkg.github.com`).

## Install

```bash
# .npmrc must contain (added automatically with pnpm/npm):
# @cachac:registry=https://npm.pkg.github.com
# //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}

pnpm add @cachac/ai-service@^0.1.4
# or
npm install @cachac/ai-service@^0.1.4
```

Auth: `GITHUB_TOKEN` / `NODE_AUTH_TOKEN` with `read:packages` scope (GitHub Packages). In CI set `NODE_AUTH_TOKEN=${{ secrets.GITHUB_TOKEN }}`.

## Env vars

| Provider | Var | Required | Notes |
|----------|-----|----------|-------|
| DeepSeek | `DEEPSEEK_API_KEY` | yes for `deepseek-*` | `trim()` applied, read inside adapter only |
| Muse Spark | `MUSE_API_KEY` or `MUSE_CONTRIBUTOR_TOKEN` | yes for `muse-*` | `trim()`, fallback `||`, fetch POST https://api.muse.example.com/v1/chat/completions |

Each adapter reads **its own env var**, isolated. Rotating one key doesn't affect the other. Keys are never returned in results, errors or logs. Missing key fails fast with `MOT-AI-010` without `fetch`.

> **Server-only:** Use only in server (`bookingAPI`, `jobsAPI`, `server/api/...` of Nuxt). Never import in Vue components or bundle to browser — keys live in server env only.

## Models

| key | model id literal | provider | MAX_TOKENS default | timeout default |
|-----|------------------|----------|-------------------|-----------------|
| `MODELS.FLASH` | `deepseek-v4-flash` | `deepseek` | 6000 | 180_000 ms |
| `MODELS.PRO` | `deepseek-v4-pro` | `deepseek` | 8000 | 180_000 ms |
| `MUSE_MODELS.SPARK` | `LLM_1751420409235724_4VRvEUuB8UJRvaAMotFs0f66XpU` (`muse-spark-1.2-contributor` alias) | `muse` | 4096 | 120_000 ms |
| fallback | any `deepseek-*` | `deepseek` | 4000 | 180_000 ms |
| fallback | any `muse-*` | `muse` | 4000 | 120_000 ms |

IDs are literals, no translation.

```js
import { MODELS, MUSE_MODELS } from '@cachac/ai-service'
// MODELS
// MODELS.FLASH === 'deepseek-v4-flash'
// MODELS.PRO === 'deepseek-v4-pro'
// MUSE_MODELS.SPARK === 'LLM_1751420409235724_4VRvEUuB8UJRvaAMotFs0f66XpU'
```

## Usage

### Non-streaming

```js
import { callAI, MODELS, ContextExceededError } from '@cachac/ai-service'

try {
  const { content, reasoningContent, usage, finishReason, provider, model } = await callAI({
    messages: [{ role: 'system', content: 'Eres asistente clínico...' }, { role: 'user', content: 'Hola' }],
    model: MODELS.FLASH, // 'deepseek-v4-flash'
    config: { temperature: 0.2, maxTokens: 6000, timeoutMs: 180_000 },
    userId: '507f...' // optional, passed as user_id to provider
  })
  console.log(content) // trimmed string, '' if missing
  console.log(reasoningContent) // string or null
  console.log(usage) // { promptTokens, completionTokens, totalTokens }
} catch (e) {
  if (e instanceof ContextExceededError) {
    // recortar historial y reintentar
  }
  throw e
}
```

Alias `prompts` (compat RQ):

```js
await callAI({ prompts: messages, model: MODELS.PRO, config: { temperature: 0.2 } })
// messages prevalece si ambos llegan; se loguea MOT-AI-015
```

Provider explícito (fuerza adapter):

```js
await callAI({ messages, model: 'custom-flash', provider: 'deepseek' })
```

Direct DeepSeek port (compat):

```js
import { callDeepSeek, MODELS } from '@cachac/ai-service'
const { content, usage } = await callDeepSeek({ messages, model: MODELS.PRO, temperature: 0.2 })
```

### Error handling

```js
import { callAI, MODELS, AIError, ContextExceededError, DeepSeekContextoExcedidoError, TimeoutError, UnknownModelError, ProviderNotRegisteredError, HTTPError } from '@cachac/ai-service'

try {
  await callAI({ messages, model: 'unknown-model' })
} catch (e) {
  if (e instanceof UnknownModelError) console.error(e.model, e.code) // MOT-AI-016
  if (e instanceof ProviderNotRegisteredError) console.error(e.provider) // MOT-AI-017
  if (e instanceof DeepSeekContextoExcedidoError) console.error('context exceeded', e instanceof ContextExceededError) // true
  if (e instanceof TimeoutError) console.error('timeout', e.code) // MOT-AI-012
  if (e instanceof HTTPError) console.error(e.status, e.body) // MOT-AI-011
  if (e instanceof AIError) console.error(e.code, e.provider)
}
```

Never leaks credentials: errors, logs and `NormalizedResult` never contain the API key.

## Config

```js
config: { temperature?, maxTokens?, timeoutMs?, includeRaw? }
```

- `temperature` 0..2, default per provider (DeepSeek 0.2, Muse 0.3) — validación estricta MOT-AI-016 si fuera de rango
- `maxTokens` techo (no objetivo) per model: `MAX_TOKENS[model] ?? 4000`. Explicit `config.maxTokens` prevalece. A low ceiling only truncates — no error.
- `topP` 0..1, `topK` integer >=1, `presencePenalty` -2..2, `frequencyPenalty` -2..2, `stop` string|string[], `seed` integer, `responseFormat` object — todos parametrizables desde cliente, validación estricta MOT-AI-016, solo se envían si no-null
- `timeoutMs` per provider (DeepSeek 180_000, Muse 120_000). `config.timeoutMs` explicit prevalece.
- `includeRaw` boolean, default false — if true, `NormalizedResult.raw` contains provider raw response.

### Timeouts — invariante de capas

> ⚠️ El `timeoutMs` del **servidor** (`ai-service` adapter, default `180_000` para DeepSeek) debe ser **estrictamente menor** que el timeout del **cliente** que lo invoca (p.ej. `booking`/`bookingCustomer` `ofetch` o `fetch`, `aiChatStore.enviarMensaje`). Si el cliente corta primero, el backend sigue: termina la llamada, guarda el mensaje y descuenta crédito mientras el usuario ve timeout y nunca ve la respuesta que pagó. Al revés no pasa nada malo: éste corta, devuelve error explícito y NO se descuenta nada.

Agotar 8 000 tokens a ~55 tok/s ronda 145 s, así que 180 s es necesario para el peor caso (ver `deepseekClient.js` original).

## NormalizedResult

```js
/**
 * @typedef {Object} NormalizedResult
 * @property {string} content - texto visible, trim() o '' si ausente
 * @property {string|null} reasoningContent - reasoning/thinking (DeepSeek: reasoning_content) o null
 * @property {{ promptTokens:number, completionTokens:number, totalTokens:number }} usage - siempre presente, 0 si ausente
 * @property {string|undefined} finishReason - 'stop'|'length'|...
 * @property {string} provider - 'deepseek'|'muse'
 * @property {string} model - id literal pedido
 * @property {any} [raw] - solo si config.includeRaw=true
 */
```

## Streaming

> **Estado en 0.1.0:** investigado, **stub**. `callAI.stream()` lanza `StreamingNotSupportedError` (`MOT-AI-018`). Ver `docs/specs/10-ai-service.md §13` y `src/stream.js` para análisis completo.

```js
import { callAI, StreamingNotSupportedError } from '@cachac/ai-service'

try {
  for await (const chunk of callAI.stream({ messages, model: MODELS.PRO })) {
    process.stdout.write(chunk.contentDelta)
  }
} catch (e) {
  if (e instanceof StreamingNotSupportedError) {
    // fallback a callAI normal
    const res = await callAI({ messages, model: MODELS.PRO })
  }
}

// Aliases
import { streamAI, stream } from '@cachac/ai-service'
for await (const chunk of streamAI(args)) {}
for await (const chunk of stream(args)) {}
```

Research summary:

- **DeepSeek:** `stream:true` con `text/event-stream` SSE (`data: {choices:[{delta:{content}}]}` ... `data: [DONE]`), leído con `fetch` + `response.body.getReader()` + `TextDecoder`, `usage` solo al final.
- **Muse Spark:** a verificar — HTTP `stream:true` SSE o SDK `ReadableStream`/`AsyncIterable`.
- **Transporte Hono/Express:** `res.writeHead(200, SSE headers)` + `res.write(data: ...)\n\n` por Chunk.
- **Nuxt proxy:** debe reenviar sin bufferizar — `ofetch` bufferiza (usar `fetch` nativo + `reader`), `h3` `defineEventHandler` hace `await` implícito → usar `sendStream(event, readable)`.
- **Recomendación:** exponer `AsyncIterable<Chunk>` sobre `fetch ReadableStream`, SSE como wire por defecto, `onChunk` como azúcar opcional. Ver spec §13 para tabla comparativa SSE vs chunked NDJSON vs ReadableStream directo.

```js
/**
 * @typedef {Object} Chunk
 * @property {string} contentDelta
 * @property {string|null} reasoningDelta
 * @property {{promptTokens:number,completionTokens:number,totalTokens:number}|undefined} usage
 * @property {string|undefined} finishReason
 * @property {string} provider
 * @property {string} model
 */
```

## Provider system

```js
import { register, resolveProvider, listModels } from '@cachac/ai-service'

// Añadir un provider (N providers)
import { openaiProvider } from './providers/openai.js'
register(openaiProvider) // ahora callAI resuelve 'openai-*' sin tocar callers
```

`callAI` infiere provider por prefijo (`deepseek-` → deepseek, `muse-` → muse) o tabla exacta, o `provider` explícito. Añadir provider = nuevo adapter + env var, sin cambiar firma de `callAI`.

## Logger

REQUERIDO desde v0.1.1 — sin fallback a `console`. Host DEBE pasar su logger construido con `@cachac/storylabs-logger` (o `{warn,error,info}`) via `callAI({logger})`, si no lanza `MOT-AI-010`.:

```js
import { makeLogger } from '@cachac/storylabs-logger'
import { CODES } from './codes.js'
const log = makeLogger({ app: 'bookingAPI', prefix: 'AI', codes: CODES })

await callAI({ messages, model: MODELS.FLASH, logger: log })
```

Códigos `MOT-AI-01x` preservados de `deepseekClient.js`:

| Código | Cuándo | Canal |
|--------|--------|-------|
| `MOT-AI-010` | Falta API key | `logger.warn` + throw |
| `MOT-AI-011` | HTTP error no reintentado / agotado | `logger.error` + throw |
| `MOT-AI-012` | Timeout AbortError / excepción | `logger.error` + throw |
| `MOT-AI-013` | Contexto excedido 400+regex | `logger.warn` + throw tipificado |
| `MOT-AI-014` | Reintento transitorio 429/5xx | `logger.warn` |
| `MOT-AI-015` | `messages` y `prompts` ambos | `logger.warn` |
| `MOT-AI-016` | Modelo desconocido | throw `UnknownModelError` |
| `MOT-AI-017` | Provider sin adapter | throw `ProviderNotRegisteredError` |
| `MOT-AI-018` | Streaming no soportado | throw `StreamingNotSupportedError` |

## ESM only

```json
{ "type": "module" }
```

No CJS. `Node >=18` for native `fetch` + `AbortController`.

## Test

```bash
bun test --timeout 30000                 # all (Bun 1.3.14)
bun test test/unit --timeout 30000       # unit only
bun test test/integration --timeout 30000 # integration (mocked fetch)
```

Tests use `bun:test` (`describe`/`it`/`expect`/`mock` from `bun:test`, `global.fetch` mocked). Do not use `node --test`.

## License

ISC

## How to upload the package
```bash
git add . && git commit -m "new version" && git push
gh release create v0.1.0 --title v0.1.0 --notes "new version"
```
