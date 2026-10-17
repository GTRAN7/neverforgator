// Every memory spot is a little "friend" living in your room.
// One component draws them everywhere: header logo, path lists, the hatching list, and the 3D sprites.

const FRIEND_COLORS = ['#FFB38A', '#8CCBFF', '#FFD86B', '#8FE3C6', '#C7B5FF', '#FF9EC4'];
export const friendColor = (number) => FRIEND_COLORS[(number - 1) % FRIEND_COLORS.length];

// state: 'awake' | 'happy' | 'sleepy' | 'asking' | 'egg' | 'hatching'
// size: 'sm' (lists) | 'md' (sprites) | 'lg' (the friend you're visiting)
export default function Creature({ number = 1, color, state = 'awake', size = 'sm' }) {
  const isEgg = state === 'egg' || state === 'hatching';
  return (
    <span className={`creature ${state} ${size}`} style={{ '--friend': color ?? friendColor(number) }} aria-hidden="true">
      {!isEgg && (
        <>
          <span className="eyes"><i /><i /></span>
          <span className="cheeks"><i /><i /></span>
        </>
      )}
    </span>
  );
}

export function Sparkle({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" />
    </svg>
  );
}
