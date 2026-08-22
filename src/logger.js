const fallbackLogger = {
  warn: (code, msg, ctx) => console.warn(`[ai-service] ${code}: ${msg}`, ctx ?? ''),
  error: (code, msg, ctx) => console.error(`[ai-service] ${code}: ${msg}`, ctx ?? ''),
  info: (code, msg, ctx) => console.info(`[ai-service] ${code}: ${msg}`, ctx ?? ''),
  debug: (code, msg, ctx) => console.debug(`[ai-service] ${code}: ${msg}`, ctx ?? '')
}

export function resolveLogger(callerLogger) {
  if (callerLogger && typeof callerLogger.warn === 'function' && typeof callerLogger.error === 'function') return callerLogger
  return fallbackLogger
}

export { fallbackLogger }
export default fallbackLogger
