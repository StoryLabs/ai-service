import { AIError } from './errors.js'

export function resolveLogger(callerLogger) {
  if (callerLogger && typeof callerLogger.warn === 'function' && typeof callerLogger.error === 'function') return callerLogger
  throw new AIError('Logger requerido: pase {warn,error,info} via callAI({logger}) — logger sin fallback desde v0.1.1', { code: 'MOT-AI-010', provider: 'global' })
}

export default { resolveLogger }
