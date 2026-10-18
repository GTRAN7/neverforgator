import { fileUrl, imageUrl } from '../api.js';

// A friend's generated picture, or what's happening with it.
export default function SpotImage({ palaceId, spot, status, onRetry, className = '' }) {
  if (spot.image) {
    return (
      <div className={`spot-image-wrap ${className}`}>
        <img className="spot-image" src={imageUrl(spot.image)} alt={spot.scene ?? ''} />
        {/* Gemini was busy, so this is a stand-in sketch (not saved): offer the real drawing. */}
        {spot.imageFinal === false && onRetry && status !== 'working' && status !== 'queued' && (
          <button className="btn ink small redraw" onClick={onRetry}>Gemini was busy · draw it again</button>
        )}
      </div>
    );
  }

  const message = {
    queued: 'waiting to hatch…',
    working: 'drawing the picture…',
    error: "couldn't draw it",
  }[status] ?? (spot.imagePrompt ? 'no picture yet' : '');
  const canRetry = onRetry && spot.imagePrompt && (status === 'error' || !status);

  return (
    <div className={`spot-image placeholder ${className}`}
      style={spot.crop ? { backgroundImage: `url(${fileUrl(palaceId, spot.crop)})` } : undefined}>
      <span className={status === 'working' ? 'pulse' : ''}>{message}</span>
      {canRetry && (
        <button className="btn ink small" onClick={onRetry}>{status === 'error' ? 'Try again' : 'Draw it'}</button>
      )}
    </div>
  );
}
