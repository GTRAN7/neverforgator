import { useCallback, useRef, useState } from 'react';
import { api } from '../api.js';

const MAX_PARALLEL = 3; // fast enough, without hitting Gemini rate limits

// Generates spot images a few at a time.
// status[spotId] is 'queued' | 'working' | 'error' (missing = done or never asked).
export function useImageQueue(palaceId, onSpotUpdated) {
  const [status, setStatus] = useState({});
  const [lastError, setLastError] = useState(''); // e.g. Gemini's quota message, shown in the UI
  const queue = useRef([]);
  const running = useRef(0);
  const onSpotRef = useRef(onSpotUpdated);
  onSpotRef.current = onSpotUpdated;

  const setOne = (id, value) =>
    setStatus((prev) => {
      const next = { ...prev };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });

  const pump = useCallback(() => {
    while (running.current < MAX_PARALLEL && queue.current.length) {
      const id = queue.current.shift();
      running.current += 1;
      setOne(id, 'working');
      api.generateImage(palaceId, id)
        .then((spot) => {
          onSpotRef.current(spot);
          setOne(id, null);
        })
        .catch((err) => {
          console.error(err);
          setLastError(err.message);
          setOne(id, 'error');
        })
        .finally(() => {
          running.current -= 1;
          pump();
        });
    }
  }, [palaceId]);

  const enqueue = useCallback((ids) => {
    setLastError('');
    for (const id of ids) {
      if (!queue.current.includes(id)) {
        queue.current.push(id);
        setOne(id, 'queued');
      }
    }
    pump();
  }, [pump]);

  return { status, lastError, enqueue };
}
