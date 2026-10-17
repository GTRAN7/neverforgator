// Every call to the backend goes through here.

// Set by App once the user is logged in: returns an Auth0 access token for the backend.
let getToken = null;
export const setTokenGetter = (fn) => { getToken = fn; };

async function request(url, options = {}) {
  const headers = { ...options.headers };
  if (getToken) headers.Authorization = `Bearer ${await getToken()}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // FastAPI puts the message in `detail` (a list of field errors for invalid input).
    const detail = Array.isArray(body.detail) ? body.detail.map((d) => d.msg).join('; ') : body.detail;
    throw new Error(detail || body.error || `Request failed (${res.status})`);
  }
  return body;
}

const send = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const palaceUrl = (id) => `/api/palaces/${id}`;
const spotUrl = (id, spotId) => `/api/palaces/${id}/spots/${spotId}`;

export const api = {
  status: () => request('/api/status'),
  listPalaces: () => request('/api/palaces'),
  createPalace: (name) => request('/api/palaces', send('POST', { name })),
  copyPalace: (id) => request(`${palaceUrl(id)}/copy`, { method: 'POST' }),
  getPalace: (id) => request(palaceUrl(id)),
  renamePalace: (id, name) => request(palaceUrl(id), send('PATCH', { name })),
  deletePalace: (id) => request(palaceUrl(id), { method: 'DELETE' }),
  usage: () => request('/api/usage'),

  // A photo of notes, a PDF or a voice recording → { text } for the notes box.
  importNotes: (blob, name) => {
    const form = new FormData();
    form.append('file', blob, name);
    return request('/api/import', { method: 'POST', body: form });
  },

  uploadRooms: (id, files) => {
    const form = new FormData();
    files.forEach(({ blob, name }) => form.append('room', blob, name));
    return request(`${palaceUrl(id)}/rooms`, { method: 'POST', body: form });
  },
  updateRoom: (id, roomId, changes) => request(`${palaceUrl(id)}/rooms/${roomId}`, send('PATCH', changes)),
  deleteRoom: (id, roomId) => request(`${palaceUrl(id)}/rooms/${roomId}`, { method: 'DELETE' }),

  addSpot: (id, spot) => request(`${palaceUrl(id)}/spots`, send('POST', spot)),
  labelSpot: (id, spotId) => request(`${spotUrl(id, spotId)}/label`, { method: 'POST' }),
  renameSpot: (id, spotId, label) => request(spotUrl(id, spotId), send('PATCH', { label })),
  // placement: { direction } or { point, viewFrom }, plus the new crop
  moveSpot: (id, spotId, placement) => request(spotUrl(id, spotId), send('PATCH', placement)),
  editIdea: (id, spotId, fact) => request(`${spotUrl(id, spotId)}/idea`, send('PUT', { fact })),
  deleteSpot: (id, spotId) => request(spotUrl(id, spotId), { method: 'DELETE' }),
  reorderSpots: (id, ids) => request(`${palaceUrl(id)}/spots/order`, send('PUT', { ids })),

  fill: (id, notes, style, flavor) => request(`${palaceUrl(id)}/fill`, send('POST', { notes, style, flavor })),
  generateImage: (id, spotId) => request(`${spotUrl(id, spotId)}/image`, { method: 'POST' }),
  // Quiz answers are checked in the browser; these just keep score.
  recordResult: (id, spotId, correct) => request(`${spotUrl(id, spotId)}/result`, send('POST', { correct })),
  addReview: (id, score, total) => request(`${palaceUrl(id)}/reviews`, send('POST', { score, total })),
  makeWeirder: (id, spotId) => request(`${spotUrl(id, spotId)}/weirder`, { method: 'POST' }),
};

export const fileUrl = (palaceId, file) => `/files/${palaceId}/${file}`;
export const imageUrl = (file) => `/cache/${file}`;
