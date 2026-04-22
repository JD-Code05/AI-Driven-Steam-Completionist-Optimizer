import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SiSteam } from 'react-icons/si'
import { HiTrophy, HiChartBar, HiCpuChip } from 'react-icons/hi2'

export default function LoginPage() {
  const { player, loading, login } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-steam-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (player) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-steam-dark to-gray-950 flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-steam-blue/10 border border-steam-blue/20 mb-6">
            <HiTrophy className="w-10 h-10 text-steam-accent" />
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Steam Achievement<br />
            <span className="text-steam-accent">Optimizer</span>
          </h1>

          <p className="text-gray-400 text-lg mb-8 max-w-md mx-auto">
            AI-powered achievement tracking and optimization. Get personalized routes to 100% your favorite games.
          </p>

          <button
            onClick={login}
            className="inline-flex items-center gap-3 px-8 py-4 bg-steam-blue hover:bg-steam-blue/80 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-steam-blue/20 hover:shadow-steam-blue/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            <SiSteam className="w-6 h-6" />
            Sign in with Steam
          </button>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16">
            <FeatureCard
              icon={<HiTrophy className="w-6 h-6 text-amber-400" />}
              title="Track Progress"
              desc="Sync achievements across all your Steam games"
            />
            <FeatureCard
              icon={<HiChartBar className="w-6 h-6 text-blue-400" />}
              title="Global Rarity"
              desc="See how rare each achievement is worldwide"
            />
            <FeatureCard
              icon={<HiCpuChip className="w-6 h-6 text-purple-400" />}
              title="AI Optimization"
              desc="Get personalized guides to complete games faster"
            />
          </div>
        </div>
      </div>

      <footer className="text-center text-xs text-gray-600 py-4">
        Not affiliated with Valve Corporation. Powered by Steam Web API.
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="bg-surface-light/50 border border-gray-800 rounded-xl p-4 text-left">
      <div className="mb-2">{icon}</div>
      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
      <p className="text-xs text-gray-500">{desc}</p>
    </div>
  )
}
