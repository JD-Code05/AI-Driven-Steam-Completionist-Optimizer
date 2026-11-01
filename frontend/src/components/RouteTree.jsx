import { useEffect, useMemo, useRef, useState } from 'react'
import { HiCheck, HiExclamationTriangle } from 'react-icons/hi2'
import { layoutTree } from '../utils/routeTree'

const STATE_TEXT = { done: 'Done', next: 'Do this next', later: 'Later' }

function RouteNode({ node, onSelect }) {
  const { achievement: a, state, missable } = node.step
  const [failed, setFailed] = useState(false)
  const src = state === 'later' ? (a.icon_gray_url || a.icon_url) : a.icon_url
  const sub = state === 'done' ? 'Done' : state === 'next' ? 'Do this next' : a.description
  return (
    <button
      type="button"
      className={`route-node route-${state}`}
      style={{ left: node.x, top: node.y }}
      aria-label={`${a.display_name}, ${STATE_TEXT[state]}${missable ? ', can be missed' : ''}`}
      onClick={() => onSelect(a.api_name)}
    >
      <span className="route-pic">
        {src && !failed
          ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
          : <span className="route-letter">{a.display_name?.[0] || '?'}</span>}
        {state === 'done' && <span className="route-tick"><HiCheck /></span>}
      </span>
      <span className="route-text">
        <b>{a.display_name}</b>
        {sub && <span className="route-sub">{sub}</span>}
        {missable && <span className="route-miss"><HiExclamationTriangle />Can be missed</span>}
      </span>
    </button>
  )
}

export default function RouteTree({ view, game, onSelect }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const [coverFailed, setCoverFailed] = useState(false)
  const layout = useMemo(() => layoutTree(view, expanded), [view, expanded])
  const scroller = useRef(null)

  // Wide trees open on the cover, not on the empty space left of it
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = layout.root.x + 34 - el.clientWidth / 2
    // only when a new route arrives: expanding a branch must not move the view
  }, [view])

  function toggle(name) {
    setExpanded((old) => {
      const next = new Set(old)
      if (!next.delete(name)) next.add(name)
      return next
    })
  }

  return (
    <div ref={scroller} className="route-scroll" tabIndex={0} role="group" aria-label="Achievement map">
      <div className="route-tree" style={{ width: layout.width, height: layout.height }}>
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
          {layout.links.map((l, i) => (
            <path key={i} d={l.d} pathLength={l.state === 'done' ? 1 : undefined} className={`route-link route-link-${l.state} ${l.trunk ? 'route-trunk' : ''}`} />
          ))}
        </svg>
        <span className="route-cover" style={{ left: layout.root.x, top: layout.root.y }}>
          {coverFailed
            ? game.name?.[0]
            : <img src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.app_id}/library_600x900_2x.jpg`} alt="" onError={() => setCoverFailed(true)} />}
        </span>
        {layout.labels.map((l) => (
          <span key={l.name} className="route-label" style={{ left: l.x, top: l.y }}>{l.name}</span>
        ))}
        {layout.nodes.map((n) => <RouteNode key={n.apiName} node={n} onSelect={onSelect} />)}
        {layout.moreButtons.map((m) => (
          <button key={m.branchName} type="button" className="route-more" style={{ left: m.x, top: m.y }} onClick={() => toggle(m.branchName)} aria-label={`${m.label} in ${m.branchName}`}>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
