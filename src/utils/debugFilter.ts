import memoize from 'lodash-es/memoize.js'

export type DebugFilter = {
  include: string[]
  exclude: string[]
  isExclusive: boolean
}

/**
 * Parse debug filter string into a filter configuration
 * Examples:
 * - "api,hooks" -> include only api and hooks categories
 * - "!1p,!file" -> exclude logging and file categories
 * - undefined/empty -> no filtering (show all)
 */
export const parseDebugFilter = memoize(
  (filterString?: string): DebugFilter | null => {
    if (!filterString || filterString.trim() === '') {
      return null
    }

    const filters = filterString
      .split(',')
      .map(f => f.trim())
      .filter(Boolean)

    // If no valid filters remain, return null
    if (filters.length === 0) {
      return null
    }

    // Check for mixed inclusive/exclusive filters
    const hasExclusive = filters.some(f => f.startsWith('!'))
    const hasInclusive = filters.some(f => !f.startsWith('!'))

    if (hasExclusive && hasInclusive) {
      return null
    }

    // Clean up filters (remove ! prefix) and normalize
    const cleanFilters = filters.map(f => f.replace(/^!/, '').toLowerCase())

    return {
      include: hasExclusive ? [] : cleanFilters,
      exclude: hasExclusive ? cleanFilters : [],
      isExclusive: hasExclusive,
    }
  },
)

/**
 * Extract debug categories from a message
 * Supports multiple patterns:
 * - "category: message" -> ["category"]
 * - "[CATEGORY] message" -> ["category"]
 * - "MCP server \"name\": message" -> ["mcp", "name"]
 * - "[ANT-ONLY] 1P event: tengu_timer" -> ["ant-only", "1p"]
 *
 * Returns lowercase categories for case-insensitive matching
 */
export function extractDebugCategories(message: string): string[] {
  const categories: string[] = []

  // Pattern 3: MCP server "servername" - Check this first to avoid false positives
  const mcpMatch = message.match(/^MCP server ["']([^"']+)["']/)
  if (mcpMatch && mcpMatch[1]) {
    categories.push('mcp')
    categories.push(mcpMatch[1].toLowerCase())
  } else {
    // Pattern 1: "category: message" (simple prefix) - only if not MCP pattern
    const prefixMatch = message.match(/^([^:[]+):/)
    if (prefixMatch && prefixMatch[1]) {
      categories.push(prefixMatch[1].trim().toLowerCase())
    }
  }

  // Pattern 2: [CATEGORY] at the start
  const bracketMatch = message.match(/^\[([^\]]+)]/)
  if (bracketMatch && bracketMatch[1]) {
    categories.push(bracketMatch[1].trim().toLowerCase())
  }

  // Pattern 4: Check for additional categories in the message
  if (message.toLowerCase().includes('1p event:')) {
    categories.push('1p')
  }

  // Pattern 5: Look for secondary categories after the first pattern
  const secondaryMatch = message.match(
    /:\s*([^:]+?)(?:\s+(?:type|mode|status|event))?:/,
  )
  if (secondaryMatch && secondaryMatch[1]) {
    const secondary = secondaryMatch[1].trim().toLowerCase()
    if (secondary.length < 30 && !secondary.includes(' ')) {
      categories.push(secondary)
    }
  }

  return Array.from(new Set(categories))
}

/**
 * Check if debug message should be shown based on filter
 * @param categories - Categories extracted from the message
 * @param filter - Parsed filter configuration
 * @returns true if message should be shown
 */
export function shouldShowDebugCategories(
  categories: string[],
  filter: DebugFilter | null,
): boolean {
  if (!filter) {
    return true
  }

  if (categories.length === 0) {
    return false
  }

  if (filter.isExclusive) {
    return !categories.some(cat => filter.exclude.includes(cat))
  } else {
    return categories.some(cat => filter.include.includes(cat))
  }
}

/**
 * Main function to check if a debug message should be shown
 * Combines extraction and filtering
 */
export function shouldShowDebugMessage(
  message: string,
  filter: DebugFilter | null,
): boolean {
  if (!filter) {
    return true
  }

  const categories = extractDebugCategories(message)
  return shouldShowDebugCategories(categories, filter)
}
