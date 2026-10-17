// ☆ / ★ toggle for marking a card for extra review.
export default function StarButton({ starred, onToggle, small = false }) {
  return (
    <button
      type="button"
      className={`star-btn${starred ? ' is-on' : ''}${small ? ' is-small' : ''}`}
      aria-pressed={!!starred}
      aria-label={starred ? 'Remove star' : 'Star for extra review'}
      title={starred ? 'Starred for extra review' : 'Star for extra review'}
      onClick={e => { e.stopPropagation(); onToggle() }}
    >
      <span aria-hidden="true">{starred ? '★' : '☆'}</span>
      {!small && (starred ? ' Starred' : ' Star')}
    </button>
  )
}
