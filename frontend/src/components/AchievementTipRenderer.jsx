import ReactMarkdown from 'react-markdown'

const inline = { p: 'span' }

function Steps({ items }) {
  return (
    <ol className="m-0 list-decimal pl-5 marker:font-semibold marker:text-faint">
      {items.map((item, i) => (
        <li key={i} className="mb-1.5 last:mb-0">
          <ReactMarkdown components={inline}>{item}</ReactMarkdown>
        </li>
      ))}
    </ol>
  )
}

function Section({ title, children }) {
  return (
    <section className="mb-[18px]">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-faint">{title}</h4>
      {children}
    </section>
  )
}

// Takes the object from parseAchievementTip(); sections without content are left out.
export default function AchievementTipRenderer({ parsedTip }) {
  if (!parsedTip) return null
  const { how_to_unlock, warnings, estimated_time, pro_tips } = parsedTip

  return (
    <div className="reveal">
      {how_to_unlock?.length > 0 && <Section title="How to unlock"><Steps items={how_to_unlock} /></Section>}
      {estimated_time && <Section title="Time"><b className="text-lg">{estimated_time}</b></Section>}
      {warnings?.length > 0 && (
        <Section title="Watch out">
          <div className="rounded-lg bg-warn-bg px-3 py-2.5 text-warn"><Steps items={warnings} /></div>
        </Section>
      )}
      {pro_tips?.length > 0 && <Section title="Tips"><Steps items={pro_tips} /></Section>}
    </div>
  )
}
