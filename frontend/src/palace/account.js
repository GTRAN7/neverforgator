// Account copies of palaces, using the backend's format (see the root README,
// "Saving a palace"). The backend stores what it understands (stops on its
// campus route, with concepts and questions) and we keep the whole palace in
// `source_text`, so opening it again restores pins, stars, places and looks.
// Photos you uploaded yourself stay in the browser that added them.
import { campusCatalog, newLocation, uid } from './seed'

const ENVELOPE = 'never-forgator'
const norm = s => (s ?? '').trim().toLowerCase()

// The local palace → a POST /palaces body. `route` is GET /locations.
export function toServer(palace, route) {
  const stops = palace.locations
  if (stops.length > route.length) {
    throw new Error(`Your account can hold palaces with up to ${route.length} stops for now (this one has ${stops.length}).`)
  }
  // Same-named places keep their spot on the backend's route; the rest take the free ones in order.
  const byName = new Map(route.map(r => [norm(r.name), r.id]))
  const used = new Set(stops.map(l => byName.get(norm(l.name))).filter(Boolean))
  const free = route.map(r => r.id).filter(id => !used.has(id))
  const claimed = new Set()
  return {
    title: (palace.title || 'My palace').trim().slice(0, 200) || 'My palace',
    source_text: JSON.stringify({ app: ENVELOPE, version: 1, palace: { ...palace, account: undefined } }),
    stops: stops.map((l, i) => {
      let location_id = byName.get(norm(l.name))
      if (!location_id || claimed.has(location_id)) location_id = free.shift()
      claimed.add(location_id)
      return {
        location_id,
        stop_order: i + 1,
        // The backend needs both; fall back to what the stop does have.
        concept: (l.concept || l.subject || l.name || `Stop ${i + 1}`).trim().slice(0, 300),
        association: (l.association || l.description || l.name || 'No memory image yet').trim(),
        questions: l.pins
          .filter(p => p.question?.trim() && p.answer?.trim())
          .map(p => ({ question: p.question.trim(), answer: p.answer.trim() })),
      }
    }),
  }
}

// GET /palaces/{id} → a local palace. Uses the saved copy when there is one;
// otherwise (e.g. made by the AI) builds stops from the backend's data.
export function fromServer(detail) {
  try {
    const saved = JSON.parse(detail.source_text)
    if (saved?.app === ENVELOPE && saved.palace?.locations) return { ...saved.palace, title: detail.title }
  } catch {
    /* not one of ours: plain notes or empty */
  }
  const photos = new Map(campusCatalog().filter(l => l.builtin).map(l => [norm(l.name), l]))
  return {
    version: 2,
    title: detail.title,
    template: 'account',
    builtinsAdded: campusCatalog().map(l => l.builtin).filter(Boolean),
    locations: detail.stops.map((s, i) => {
      const photo = photos.get(norm(s.location.name))
      return {
        ...newLocation({ name: s.location.name, description: s.location.description ?? '' }, i),
        ...(photo && { builtin: photo.builtin, cutout: photo.cutout, ar: photo.ar, variant: photo.variant }),
        concept: s.concept,
        association: s.association,
        // The backend has no pin spots, so lay the cards out in a loose grid.
        pins: s.questions.map((q, j) => ({
          id: uid(),
          x: 25 + (j % 3) * 25,
          y: 35 + Math.floor(j / 3) * 20,
          topic: '',
          question: q.question,
          answer: q.answer,
          stats: { right: 0, wrong: 0 },
        })),
      }
    }),
  }
}

// Save (or re-save) a palace to the account. The backend can't update a saved
// palace yet, so a re-save uploads a fresh copy and deletes the old one (that
// copy's quiz score history goes with it). Returns the new link for `palace.account`.
export async function saveToAccount(api, palace) {
  const route = await api('/locations')
  const { id } = await api('/palaces', { method: 'POST', body: toServer(palace, route) })
  if (palace.account?.id) await api(`/palaces/${palace.account.id}`, { method: 'DELETE' }).catch(() => {})
  return { id, savedAt: Date.now() }
}

// Download an account palace, ready to store in this browser.
export async function openFromAccount(api, id) {
  const palace = fromServer(await api(`/palaces/${id}`))
  return { ...palace, account: { id, savedAt: Date.now() } }
}
