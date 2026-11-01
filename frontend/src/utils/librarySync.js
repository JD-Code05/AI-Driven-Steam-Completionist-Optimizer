// Sync one game at a time: each is its own request, so the library can't hit the server's request time limit.
export async function runLibrarySync(appIds, syncOne, { onProgress = () => {}, shouldStop = () => false } = {}) {
  const total = appIds.length
  let done = 0
  let failed = 0
  for (const [i, appId] of appIds.entries()) {
    if (shouldStop()) return { total, done, failed, stopped: 'left' }
    onProgress(i + 1, total)
    try {
      await syncOne(appId)
      done++
    } catch (err) {
      const status = err.response?.status
      if (status === 429) return { total, done, failed, stopped: 'rate_limited' }
      if (status === 403) return { total, done, failed, stopped: 'private' }
      failed++
    }
  }
  return { total, done, failed, stopped: null }
}

export function syncSummary({ total, done, failed, stopped }) {
  if (stopped === 'rate_limited') return 'Steam asked us to slow down. Try again later.'
  if (stopped === 'private') return "Steam returned no achievements. Make sure your game details are public in Steam's privacy settings."
  if (stopped === 'left' || !failed) return ''
  return `Synced ${done} of ${total}. ${failed} couldn't be loaded; press Sync to try again.`
}
