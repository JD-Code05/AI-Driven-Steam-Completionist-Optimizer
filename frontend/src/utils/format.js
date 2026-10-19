// The backend sends UTC datetimes without a Z/offset; Date would read those as local time.
const parse = (iso) => Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`)

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return 'never'
  const s = (now - parse(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}

export function formatDate(iso) {
  return new Date(parse(iso)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
