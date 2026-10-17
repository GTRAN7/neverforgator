import { useDisplay } from '../lib/display.js';

// Sun / moon button in the header: switches night mode (also in Settings).
export default function NightToggle() {
  const [{ night }, update] = useDisplay();
  return (
    <button className="nav-pill night-toggle" onClick={() => update({ night: !night })}
      aria-pressed={night} aria-label={night ? 'Switch to day mode' : 'Switch to night mode'}
      title={night ? 'Day mode' : 'Night mode'}>
      {night ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="#fbe7a6" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15.5 2.5A9.5 9.5 0 1 0 21.5 17 7.6 7.6 0 1 1 15.5 2.5Z" fill="#f4efd9" stroke="currentColor"
            strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
