// The NeverForgator mascot: a round little gator (it never forgets where it put things).
export function Gator({ size = 40 }) {
  return (
    <svg className="gator" width={size} height={size * 0.75} viewBox="0 0 64 48" aria-hidden="true">
      <path d="M6 30 C6 18 16 14 26 14 L50 16 C58 17 61 22 61 27 C61 33 56 36 49 36 L18 38 C10 38 6 35 6 30 Z"
        fill="#7FC28E" stroke="#3B2A1E" strokeWidth="3" strokeLinejoin="round" />
      <path d="M24 36 l3 4 3 -4 3 4 3 -4 3 4 3 -4 3 4 3 -4" fill="#FFFDF7" stroke="#3B2A1E" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="18" cy="13" r="8" fill="#7FC28E" stroke="#3B2A1E" strokeWidth="3" />
      <circle cx="32" cy="12" r="8" fill="#7FC28E" stroke="#3B2A1E" strokeWidth="3" />
      <circle cx="18" cy="12" r="4.5" fill="#FFFDF7" />
      <circle cx="32" cy="11" r="4.5" fill="#FFFDF7" />
      <circle cx="19" cy="12.5" r="2.4" fill="#3B2A1E" />
      <circle cx="33" cy="11.5" r="2.4" fill="#3B2A1E" />
      <circle cx="54" cy="21" r="1.6" fill="#3B2A1E" />
      <circle cx="49" cy="20" r="1.6" fill="#3B2A1E" />
      <ellipse cx="14" cy="29" rx="4" ry="2.4" fill="rgba(230,80,110,0.45)" />
    </svg>
  );
}

// Logo + name, used in every header.
export default function Logo({ href, big = false }) {
  const content = (
    <>
      <Gator size={big ? 72 : 40} />
      <span className={`wordmark ${big ? 'huge' : ''}`}>NeverForgator</span>
    </>
  );
  return href
    ? <a href={href} className="brand-link" title="All palaces">{content}</a>
    : <span className="brand-link">{content}</span>;
}
