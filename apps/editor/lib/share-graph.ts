type ShareGraph = Record<string, unknown> & {
  comments?: unknown
  unitPrices?: unknown
}

/**
 * Create the only graph object that may cross the share Server Component's
 * client boundary. Sensitive bags are omitted, not hidden with CSS or emptied
 * after hydration, so their values never enter the RSC/HTML payload.
 */
export function prepareShareGraph<T extends ShareGraph>(
  graph: T,
  options: { allowComments: boolean; showCost: boolean },
): ShareGraph {
  const visibleGraph: ShareGraph = options.allowComments ? { ...graph } : { ...graph, comments: {} }
  if (options.showCost) return visibleGraph

  const { unitPrices: _unitPrices, ...withoutCosts } = visibleGraph
  return withoutCosts
}

/**
 * The comment route starts from the authoritative stored graph and replaces
 * one bag only. In particular, it never saves the redacted client graph back.
 */
export function replaceShareComments<T extends ShareGraph>(
  graph: T,
  comments: unknown,
): ShareGraph {
  return { ...graph, comments }
}
