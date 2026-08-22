import { AIError, HTTPError, TimeoutError } from './errors.js'
import { resolveLogger } from './logger.js'

/**
 * Factory para clasificar fallos HTTP con reintento y backoff.
 * Cada provider inyecta su isTransient, isContextExceeded y constantes, manteniendo su usage/payload aislado.
 *
 * @param {Object} opts
 * @param {(status:number)=>boolean} opts.isTransient - true si 429||5xx reintentable
 * @param {(status:number, body:string)=>boolean} opts.isContextExceeded - true si 400 + regex contexto
 * @param {number} opts.MAX_RETRIES - ej. 3
 * @param {number} opts.BASE_RETRY_DELAY_MS - ej. 1000
 * @param {string} opts.provider - 'deepseek'|'muse' para logs y errores
 * @param {typeof import('./errors.js').ContextExceededError} opts.ContextError - clase a lanzar en contexto excedido
 * @returns {(response:Response, retries:number, logger:any)=>Promise<number>} - retorna retries restantes o lanza
 */
export function createClassifyFailure({ isTransient, isContextExceeded, MAX_RETRIES, BASE_RETRY_DELAY_MS, provider, ContextError }) {
  return async (response, retries, logger) => {
    const log = resolveLogger(logger)
    const errText = await response.text()

    if (isContextExceeded(response.status, errText)) {
      log.warn('MOT-AI-013', `${provider} rechazó por contexto excedido`, { status: response.status })
      // ContextError ya tiene provider y code MOT-AI-013
      throw new ContextError(undefined, { provider })
    }

    if (isTransient(response.status) && retries > 1) {
      const delay = BASE_RETRY_DELAY_MS * (MAX_RETRIES - retries + 1)
      log.warn('MOT-AI-014', `${provider} falló con error transitorio — reintentando`, {
        status: response.status,
        remainingRetries: retries - 1,
        delayMs: delay
      })
      await new Promise(r => setTimeout(r, delay))
      return retries - 1
    }

    log.error('MOT-AI-011', `Error HTTP desde ${provider} API`, { status: response.status, body: errText })
    throw new HTTPError(`Error en API ${provider} (${response.status})`, {
      provider,
      status: response.status,
      body: errText
    })
  }
}

/**
 * Helper genérico para envolver fetch con retry via classifyFailure.
 * No se usa directamente en adapters (ellos hacen recursion con execute*), pero expone lógica para tests.
 */
export { AIError, HTTPError, TimeoutError }
