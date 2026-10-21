// Matches the data_sources.source_type enum; 'other'/'blog' are never inferred.
export function inferSourceType(url) {
  let host
  try { host = new URL(url).hostname.toLowerCase() } catch { return 'article' }
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube'
  if (host.includes('wiki') || host.includes('fandom')) return 'wiki'
  return 'article'
}
