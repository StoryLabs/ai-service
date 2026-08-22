import { AIError, HTTPError, TimeoutError } from './errors.js'
import { resolveLogger } from './logger.js'

/**
 * Factory para clasificar fallos HTTP con reintento y backoff.
 * Cada provider inyecta su esTransitorio, esContextoExcedido y constantes, manteniendo su usage/payload aislado.
 *
 * @param {Object} opts
 * @param {(status:number)=>boolean} opts.esTransitorio - true si 429||5xx reintentable
 * @param {(status:number, body:string)=>boolean} opts.esContextoExcedido - true si 400 + regex contexto
 * @param {number} opts.MAX_INTENTOS - ej. 3
 * @param {number} opts.ESPERA_BASE_MS - ej. 1000
 * @param {string} opts.provider - 'deepseek'|'muse' para logs y errores
 * @param {typeof import('./errors.js').ContextExceededError} opts.ContextError - clase a lanzar en contexto excedido
 * @returns {(response:Response, intentos:number, logger:any)=>Promise<number>} - retorna intentos restantes o lanza
 */
export function createClasificarFallo({ esTransitorio, esContextoExcedido, MAX_INTENTOS, ESPERA_BASE_MS, provider, ContextError }) {
  return async (response, intentos, logger) => {
    const log = resolveLogger(logger)
    const errText = await response.text()

    if (esContextoExcedido(response.status, errText)) {
      log.warn('MOT-AI-013', `${provider} rechazó por contexto excedido`, { status: response.status })
      // ContextError ya tiene provider y code MOT-AI-013
      throw new ContextError(undefined, { provider })
    }

    if (esTransitorio(response.status) && intentos > 1) {
      const espera = ESPERA_BASE_MS * (MAX_INTENTOS - intentos + 1)
      log.warn('MOT-AI-014', `${provider} falló con error transitorio — reintentando`, {
        status: response.status,
        intentosRestantes: intentos - 1,
        esperaMs: espera
      })
      await new Promise(r => setTimeout(r, espera))
      return intentos - 1
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
 * Helper genérico para envolver fetch con retry via clasificarFallo.
 * No se usa directamente en adapters (ellos hacen recursion con execute*), pero expone lógica para tests.
 */
export { AIError, HTTPError, TimeoutError }
