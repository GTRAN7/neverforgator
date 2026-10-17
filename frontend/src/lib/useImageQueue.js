import { useCallback, useRef, useState } from 'react';
import { api } from '../api.js';

const BATCH = 4; // pictures per request: the backend draws them in one Gemini call

// Draws spot pictures in the background, a batch at a time (one request in flight), so walking
// through a palace never fires a burst of Gemini calls.
// status[spotId] is 'queued' | 'working' | 'error' (missing = done or never asked).
export function useImageQueue(palaceId, onSpotUpdated) {
  const [status, setStatus] = useState({});
  const [lastError, setLastError] = useState(''); // e.g. Gemini's quota message, shown in the UI
  const queue = useRef([]);
  const running = useRef(false);
  const onSpotRef = useRef(onSpotUpdated);
  onSpotRef.current = onSpotUpdated;

  const setMany = (ids, value) =>
    setStatus((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (value) next[id] = value;
        else delete next[id];
      }
      return next;
    });

  const pump = useCallback(function pump() {
    if (running.current || !queue.current.length) return;
    const ids = queue.current.splice(0, BATCH);
    running.current = true;
    setMany(ids, 'working');
    api.drawPictures(palaceId, ids)
      .then((spots) => {
        spots.forEach((spot) => onSpotRef.current(spot));
        setMany(ids, null);
      })
      .catch((err) => {
        console.error(err);
        setLastError(err.message);
        setMany(ids, 'error');
      })
      .finally(() => {
        running.current = false;
        pump();
      });
  }, [palaceId]);

  const enqueue = useCallback((ids) => {
    setLastError('');
    for (const id of ids) {
      if (!queue.current.includes(id)) {
        queue.current.push(id);
        setMany([id], 'queued');
      }
    }
    pump();
  }, [pump]);

  return { status, lastError, enqueue };
}
