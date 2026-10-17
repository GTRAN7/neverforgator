// Moon/sun button that flips night mode.
export default function NightToggle({ night, onToggle, className = '' }) {
  return (
    <button
      className={`night-toggle ${className}`}
      onClick={onToggle}
      aria-pressed={night}
      aria-label={night ? 'Switch to day mode' : 'Switch to night mode'}
      title={night ? 'Day mode' : 'Night mode'}
    >
      {night ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="5" fill="#fbe7a6" stroke="currentColor" strokeWidth="2" />
          <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15.5 2.5A9.5 9.5 0 1 0 21.5 17 7.6 7.6 0 1 1 15.5 2.5Z" fill="#f4efd9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
