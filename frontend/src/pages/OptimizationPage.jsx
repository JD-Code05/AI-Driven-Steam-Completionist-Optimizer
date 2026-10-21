import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { gamesAPI, aiAPI } from '../services/api'
import Layout from '../components/Layout'
import { timeAgo } from '../utils/format'
import ReactMarkdown from 'react-markdown'
import { HiArrowLeft, HiCpuChip, HiClock, HiSparkles, HiArrowPath } from 'react-icons/hi2'

export default function OptimizationPage() {
  const { gameId } = useParams()
  const { player } = useAuth()

  const [game, setGame] = useState(null)
  const [route, setRoute] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [gameId])

  async function loadData() {
    setLoading(true)
    try {
      const [gameRes] = await Promise.all([
        gamesAPI.get(gameId),
      ])
      setGame(gameRes.data)

      try {
        const routeRes = await aiAPI.getRoute(gameId)
        setRoute(routeRes.data)
      } catch {
        // No route yet — that's fine
        setRoute(null)
      }
    } catch (err) {
      console.error('Failed to load optimization data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const { data } = await aiAPI.generate(gameId)
      setRoute(data.route)
    } catch (err) {
      setError(err.response?.data?.error || 'Generation failed. Check your Gemini API key and try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleRegenerate() {
    setGenerating(true)
    setError(null)
    try {
      const { data } = await aiAPI.regenerate(gameId)
      setRoute(data.route)
    } catch (err) {
      setError(err.response?.data?.error || 'Regeneration failed.')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin w-8 h-8 border-2 border-muted border-t-transparent rounded-full" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Back link */}
      <Link
        to={`/games/${gameId}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text transition-colors mb-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <HiArrowLeft className="w-4 h-4" />
        Back to {game?.name || 'Game'}
      </Link>

      {/* Header */}
      <div className="bg-surface rounded-xl border border-border p-6 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-hover rounded-lg">
            <HiCpuChip className="w-6 h-6 text-ink" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">AI Optimization Route</h1>
            <p className="text-sm text-muted">{game?.name}</p>
          </div>
          {route && (
            <button
              onClick={handleRegenerate}
              disabled={generating}
              className="ml-auto inline-flex items-center gap-2 px-3 py-2 bg-hover hover:bg-track text-text text-sm rounded-lg border border-border-strong transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <HiArrowPath className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Regenerating...' : 'Regenerate'}
            </button>
          )}
        </div>
        {route && (
          <div className="flex items-center gap-4 mt-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <HiSparkles className="w-3 h-3" />
              Model: {route.model_used || 'Unknown'}
            </span>
            <span className="flex items-center gap-1">
              <HiClock className="w-3 h-3" />
              Generated: {timeAgo(route.created_at)}
            </span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-warn-bg border border-warn/30 rounded-xl p-4 mb-6">
          <p className="text-sm text-warn">{error}</p>
        </div>
      )}

      {/* Generating indicator */}
      {generating && (
        <div className="bg-surface rounded-xl border border-border p-12 text-center mb-6">
          <div className="animate-spin w-10 h-10 border-2 border-ink border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-text font-medium">Generating optimization route...</p>
          <p className="text-xs text-muted mt-1">This may take 15-30 seconds</p>
        </div>
      )}

      {/* Content */}
      {route ? (
        <div className="bg-surface rounded-xl border border-border p-6 lg:p-8">
          <div className="prose prose-invert prose-base max-w-none
            prose-headings:text-text prose-headings:font-bold
            prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
            prose-p:text-text prose-p:leading-relaxed
            prose-a:text-ink prose-a:underline hover:prose-a:no-underline
            prose-strong:text-text
            prose-li:text-text
            prose-code:text-text prose-code:bg-hover prose-code:px-2 prose-code:py-1 prose-code:rounded-md
            prose-pre:bg-bg prose-pre:border prose-pre:border-border prose-pre:p-4 prose-pre:rounded-lg
            prose-blockquote:border-l-4 prose-blockquote:border-border-strong prose-blockquote:pl-4 prose-blockquote:text-muted
            prose-hr:border-border
            prose-table:text-base prose-table:w-full prose-table:border-collapse
            prose-th:bg-hover prose-th:p-3 prose-th:text-text prose-th:font-semibold prose-th:border prose-th:border-border
            prose-td:p-3 prose-td:text-muted prose-td:border prose-td:border-border
          ">
            <ReactMarkdown>{route.summary_md}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <HiCpuChip className="w-16 h-16 text-faint mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text mb-2">No Optimization Route Yet</h2>
          <p className="text-sm text-muted mb-6 max-w-md mx-auto">
            Generate a personalized achievement optimization route powered by Gemini AI.
            Make sure you've synced achievements and added bookmarks first.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-3 bg-ink text-on-ink font-medium rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <HiSparkles className={`w-5 h-5 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Generating...' : 'Generate AI Route'}
            </button>
            <Link
              to={`/games/${gameId}`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-surface border border-border-strong text-text text-sm rounded-lg hover:bg-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <HiArrowLeft className="w-4 h-4" />
              Back to Game
            </Link>
          </div>
        </div>
      )}
    </Layout>
  )
}
