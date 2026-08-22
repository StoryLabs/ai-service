/**
 * Streaming Research Chapter — src/stream.js
 *
 * Estado v1: investigado, stub. No bloquea v1.
 * Ver docs/specs/10-ai-service.md §13 para análisis completo.
 *
 * Análisis resumido:
 * - DeepSeek: stream:true en POST /v1/chat/completions con text/event-stream (SSE)
 *   data: {"choices":[{"delta":{"content":"Hola"}}]}  ... data: [DONE]
 *   Se lee con fetch + response.body.getReader() + TextDecoder + split por \n\n
 *   reasoning_content puede llegar como delta.reasoning_content, usage solo al final.
 * - Muse Spark: a verificar — HTTP con stream:true SSE o SDK con ReadableStream/AsyncIterable.
 *
 * Transporte hacia caller/browser:
 * | Transporte | Headers | Hono/Express | Nuxt proxy | Notas |
 * | SSE text/event-stream | Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive | ✅ res.write data: {...}\n\n | ⚠️ verificar ofetch/h3 buffering — usar h3 sendStream(event, readable) | Estándar OpenAI/DeepSeek |
 * | Chunked NDJSON | Transfer-Encoding: chunked, application/x-ndjson | ✅ res.write(JSON+\\n) | ✅ menos buffering | Simple |
 * | ReadableStream directo | — | N/A | N/A | Solo interno AsyncIterable |
 *
 * Hono/Express: res.writeHead(200, SSE headers); por Chunk → res.write(`data: ${JSON.stringify(chunk)}\\n\\n`); res.write('data: [DONE]\\n\\n'); res.end()
 * Nuxt proxy: debe reenviar sin bufferizar — ofetch bufferiza (usar fetch nativo + reader), h3 defineEventHandler hace await implícito → usar sendStream(event, readable).
 *
 * Forma de exponer en paquete (recomendación):
 *   for await (const chunk of callAI.stream({ messages, model, config })) { process.stdout.write(chunk.contentDelta) }
 * Opción B onChunk, Opción C ambas (stream retorna AsyncIterable y callAI acepta onChunk azúcar).
 *
 * Chunk normalizado:
 *   { contentDelta:string, reasoningDelta:string|null, usage?:{promptTokens,completionTokens,totalTokens}, finishReason?:string, provider:string, model:string }
 */

import { StreamingNotSupportedError } from './errors.js'

/**
 * @typedef {Object} Chunk
 * @property {string} contentDelta - delta de texto visible en este chunk ('' si solo reasoning)
 * @property {string|null} reasoningDelta - delta de reasoning_content si el provider lo expone
 * @property {{promptTokens:number,completionTokens:number,totalTokens:number}|undefined} usage - solo en último chunk si provider lo envía al final
 * @property {string|undefined} finishReason - 'stop'|'length'|... solo en último chunk
 * @property {string} provider - 'deepseek'|'muse'
 * @property {string} model - id literal pedido
 */

/**
 * Streaming stub — lanza StreamingNotSupportedError.
 * Cada adapter que no soporte streaming en v1 debe hacer: async *stream() { throw new StreamingNotSupportedError(this.name) }
 *
 * @param {Object} args - mismos que callAI (messages|prompts, model, config, userId, provider, logger, signal)
 * @returns {AsyncIterable<Chunk>}
 * @throws {StreamingNotSupportedError}
 */
// eslint-disable-next-line require-yield
export async function* streamAI(args) {
  const provider = args?.provider || (args?.model?.startsWith('muse-') ? 'muse' : args?.model?.startsWith('deepseek-') ? 'deepseek' : 'global')
  throw new StreamingNotSupportedError(provider, 'Streaming no está habilitado en v1. Ver docs/specs/10-ai-service.md §13.')
}

export default streamAI
