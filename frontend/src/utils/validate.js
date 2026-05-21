export const SYMBOL_REGEX = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/

export function normalizeSymbol(raw) {
  return (raw || '').trim().toUpperCase()
}

export function isValidSymbol(raw) {
  return SYMBOL_REGEX.test(normalizeSymbol(raw))
}
