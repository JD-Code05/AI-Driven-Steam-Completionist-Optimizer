import { useState, useEffect } from 'react'
import { HiOutlineTrash } from 'react-icons/hi2'
import { dataSourcesAPI } from '../services/api'
import { inferSourceType } from '../utils/sourceType'

const focusCls = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const labels = { youtube: 'Video', wiki: 'Wiki' }

export default function GuidesCard({ gameId }) {
  const [sources, setSources] = useState([])
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSources([])
    dataSourcesAPI.list(gameId).then(({ data }) => setSources(data)).catch(() => setError("Couldn't load your guides."))
  }, [gameId])

  async function add(e) {
    e.preventDefault()
    const link = url.trim()
    if (!link) return
    setBusy(true)
    setError('')
    try {
      const { data } = await dataSourcesAPI.create({ game_id: Number(gameId), url: link, source_type: inferSourceType(link) })
      setSources((prev) => [data, ...prev])
      setUrl('')
    } catch {
      setError("Couldn't add that link.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    setError('')
    try {
      await dataSourcesAPI.delete(id)
      setSources((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError("Couldn't remove that guide.")
    }
  }

  return (
    <section className="rounded-[10px] border border-border bg-surface px-4 py-3.5">
      <h3 className="mb-1 text-[13px] font-semibold">Guides</h3>
      <p className="mb-2.5 text-xs text-muted">Links you keep for this game.</p>

      {sources.length === 0 && <p className="border-t border-border py-2.5 text-[13px] text-muted">No guides yet.</p>}
      {sources.map((s) => (
        <div key={s.id} className="flex items-start gap-2.5 border-t border-border py-2">
          <span className="w-11 flex-none pt-[3px] text-[10px] font-semibold uppercase tracking-[.05em] text-faint">
            {labels[s.source_type] || 'Guide'}
          </span>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`min-w-0 flex-1 truncate font-medium [@media(hover:hover)_and_(pointer:fine)]:hover:underline ${focusCls}`}
          >
            {s.title || s.url}
          </a>
          <button
            type="button"
            aria-label="Remove guide"
            onClick={() => remove(s.id)}
            className={`grid size-6 flex-none cursor-pointer place-items-center rounded-md text-muted transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-hover [@media(hover:hover)_and_(pointer:fine)]:hover:text-text ${focusCls}`}
          >
            <HiOutlineTrash className="size-3.5" />
          </button>
        </div>
      ))}

      <form onSubmit={add} className="mt-2.5 flex gap-1.5">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a guide link"
          aria-label="Guide link"
          className="min-w-0 flex-1 rounded-[7px] border border-border-strong bg-bg px-2.5 py-[7px] text-[13px] text-text placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
        />
        <button
          type="submit"
          disabled={busy}
          className={`cursor-pointer rounded-[7px] border border-border-strong bg-surface px-3.5 py-2 text-[13px] font-semibold transition-colors duration-150 disabled:opacity-60 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-hover ${focusCls}`}
        >
          Add
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-warn">{error}</p>}
    </section>
  )
}
