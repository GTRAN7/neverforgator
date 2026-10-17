// Every call to the backend goes through here.

// Set by App once the user is logged in: returns an Auth0 access token for the backend.
let getToken = null;
export const setTokenGetter = (fn) => { getToken = fn; };

async function request(url, options = {}) {
  const headers = { ...options.headers };
  if (getToken) headers.Authorization = `Bearer ${await getToken()}`;
  const res = await fetch(url, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
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
  deleteSpot: (id, spotId) => request(spotUrl(id, spotId), { method: 'DELETE' }),
  reorderSpots: (id, ids) => request(`${palaceUrl(id)}/spots/order`, send('PUT', { ids })),

  fill: (id, notes, style) => request(`${palaceUrl(id)}/fill`, send('POST', { notes, style })),
  generateImage: (id, spotId) => request(`${spotUrl(id, spotId)}/image`, { method: 'POST' }),
  // answer: what the user typed ("what's here?"), or placeId: the spot they picked ("where did you put it?")
  grade: (id, spotId, answer) => request(`${spotUrl(id, spotId)}/grade`, send('POST', answer)),
  makeWeirder: (id, spotId) => request(`${spotUrl(id, spotId)}/weirder`, { method: 'POST' }),
};

export const fileUrl = (palaceId, file) => `/files/${palaceId}/${file}`;
export const imageUrl = (file) => `/cache/${file}`;
