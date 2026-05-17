import { HiCheckCircle, HiExclamationTriangle, HiClock, HiLightBulb } from 'react-icons/hi2'

/**
 * Renders parsed achievement tip with structured sections
 * Takes parsed tip object from achievementTipParser.parseAchievementTip()
 * 
 * Section order: Estimated Time → How to Unlock → Important Warnings → Pro Tips
 */
export default function AchievementTipRenderer({ parsedTip }) {
  if (!parsedTip) {
    return null
  }

  const { how_to_unlock, warnings, estimated_time, pro_tips } = parsedTip

  return (
    <div className="space-y-6">
      {/* Estimated Time Section */}
      {estimated_time && (
        <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <HiClock className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Estimated Time</h3>
              <p className="text-white text-lg font-bold mt-1">{estimated_time}</p>
            </div>
          </div>
        </div>
      )}

      {/* How to Unlock Section */}
      {how_to_unlock && how_to_unlock.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <HiCheckCircle className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-white">How to Unlock</h3>
          </div>
          <ol className="space-y-3 ml-8 list-decimal list-outside">
            {how_to_unlock.map((step, idx) => (
              <li key={idx} className="text-white text-sm">
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Important Warnings Section */}
      {warnings && warnings.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <HiExclamationTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <h3 className="text-lg font-bold text-white">Important Warnings</h3>
          </div>
          <ol className="space-y-3 ml-8 list-decimal list-outside">
            {warnings.map((warning, idx) => (
              <li key={idx} className="text-white text-sm">
                {warning}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Pro Tips Section */}
      {pro_tips && pro_tips.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <HiLightBulb className="w-5 h-5 text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-white">Pro Tips</h3>
          </div>
          <ol className="space-y-3 ml-8 list-decimal list-outside">
            {pro_tips.map((tip, idx) => (
              <li key={idx} className="text-white text-sm">
                {tip}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
