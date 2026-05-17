import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { gamesAPI, aiAPI } from '../services/api'
import Layout from '../components/Layout'
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
          <div className="animate-spin w-8 h-8 border-2 border-steam-accent border-t-transparent rounded-full" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Back link */}
      <Link
        to={`/games/${gameId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors mb-4"
      >
        <HiArrowLeft className="w-4 h-4" />
        Back to {game?.name || 'Game'}
      </Link>

      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/20 to-surface-light rounded-xl border border-purple-500/20 p-6 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <HiCpuChip className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">AI Optimization Route</h1>
            <p className="text-sm text-gray-400">{game?.name}</p>
          </div>
          {route && (
            <button
              onClick={handleRegenerate}
              disabled={generating}
              className="ml-auto inline-flex items-center gap-2 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-sm rounded-lg border border-purple-500/30 transition-colors disabled:opacity-50"
            >
              <HiArrowPath className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Regenerating...' : 'Regenerate'}
            </button>
          )}
        </div>
        {route && (
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <HiSparkles className="w-3 h-3" />
              Model: {route.model_used || 'Unknown'}
            </span>
            <span className="flex items-center gap-1">
              <HiClock className="w-3 h-3" />
              Generated: {new Date(route.created_at).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Generating indicator */}
      {generating && (
        <div className="bg-surface-light rounded-xl border border-purple-500/20 p-12 text-center mb-6">
          <div className="animate-spin w-10 h-10 border-2 border-purple-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-purple-300 font-medium">Generating optimization route...</p>
          <p className="text-xs text-gray-500 mt-1">This may take 15-30 seconds</p>
        </div>
      )}

      {/* Content */}
      {route ? (
        <div className="bg-surface-light rounded-xl border border-gray-800 p-6 lg:p-8">
          <div className="prose prose-invert prose-base max-w-none
            prose-headings:text-white prose-headings:font-bold
            prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
            prose-p:text-gray-300 prose-p:leading-relaxed
            prose-a:text-steam-accent prose-a:underline hover:prose-a:no-underline
            prose-strong:text-white
            prose-li:text-gray-300
            prose-code:text-purple-300 prose-code:bg-purple-900/20 prose-code:px-2 prose-code:py-1 prose-code:rounded-md
            prose-pre:bg-surface prose-pre:border prose-pre:border-gray-700 prose-pre:p-4 prose-pre:rounded-lg
            prose-blockquote:border-l-4 prose-blockquote:border-steam-blue prose-blockquote:pl-4 prose-blockquote:text-gray-400
            prose-hr:border-gray-700
            prose-table:text-base prose-table:w-full prose-table:border-collapse
            prose-th:bg-surface prose-th:p-3 prose-th:text-gray-300 prose-th:font-semibold prose-th:border border-gray-700
            prose-td:p-3 prose-td:text-gray-400 prose-td:border border-gray-700
          ">
            <ReactMarkdown>{route.summary_md}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="bg-surface-light rounded-xl border border-gray-800 p-12 text-center">
          <HiCpuChip className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No Optimization Route Yet</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Generate a personalized achievement optimization route powered by Gemini AI.
            Make sure you've synced achievements and added bookmarks first.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-3 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 font-medium rounded-lg border border-purple-500/30 transition-colors disabled:opacity-50"
            >
              <HiSparkles className={`w-5 h-5 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Generating...' : 'Generate AI Route'}
            </button>
            <Link
              to={`/games/${gameId}`}
              className="inline-flex items-center gap-2 px-4 py-3 bg-surface border border-gray-700 text-gray-300 text-sm rounded-lg hover:border-gray-600 transition-colors"
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
