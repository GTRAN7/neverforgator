// Placeholder "pictures": an SVG sketch card in the app's style instead of a generated image.
// Free and instant. Used when PICTURES=placeholder (the default) or when there's no API key.

const FRIEND_COLORS = ['#FFB38A', '#8CCBFF', '#FFD86B', '#8FE3C6', '#C7B5FF', '#FF9EC4'];
const SKIES = {
  storybook: ['#BFE0EA', '#FBF4E6'],
  claymation: ['#FFD9B8', '#F3E3C8'],
  sticker: ['#E3EEDF', '#FFFDF7'],
  pixel: ['#C7B5FF', '#F1E5CF'],
};
const STYLE_NAMES = { storybook: 'storybook', claymation: 'claymation', sticker: 'sticker', pixel: 'pixel art' };

const escape = (s) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The card already prints the scene text, so the sketch is just a friend in a
// little scene plus the picture style. The prompt only picks the friend's color.
export function placeholderImage(prompt, style = 'storybook') {
  const seed = [...prompt].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const body = FRIEND_COLORS[seed % FRIEND_COLORS.length];
  const [sky, ground] = SKIES[style] ?? SKIES.storybook;
  const name = STYLE_NAMES[style] ?? STYLE_NAMES.storybook;
  const pixel = style === 'pixel';
  const blob = pixel
    ? '<rect x="314" y="150" width="140" height="124" fill="BODY" stroke="#3B2A1E" stroke-width="6"/>'
    : '<path d="M384 144 C 452 144 470 194 470 224 C 470 264 432 278 384 278 C 336 278 298 264 298 224 C 298 194 316 144 384 144 Z" fill="BODY" stroke="#3B2A1E" stroke-width="6"/>';

  // 768x468 matches the polaroid's photo slot, so nothing gets cropped.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="468" viewBox="0 0 768 468"${pixel ? ' shape-rendering="crispEdges"' : ''}>
  <rect width="768" height="468" fill="${sky}"/>
  <rect y="290" width="768" height="178" fill="${ground}"/>
  <ellipse cx="384" cy="300" rx="150" ry="20" fill="rgba(59,42,30,0.12)"/>
  <g fill="#FFD86B" stroke="#3B2A1E" stroke-width="3" stroke-linejoin="round">
    <path d="M170 110 l8 24 24 8 -24 8 -8 24 -8 -24 -24 -8 24 -8z"/>
    <path d="M600 80 l6 18 18 6 -18 6 -6 18 -6 -18 -18 -6 18 -6z"/>
    <path d="M630 210 l5 14 14 5 -14 5 -5 14 -5 -14 -14 -5 14 -5z"/>
  </g>
  ${blob.replace('BODY', body)}
  <ellipse cx="362" cy="208" rx="7" ry="10" fill="#3B2A1E"/>
  <ellipse cx="406" cy="208" rx="7" ry="10" fill="#3B2A1E"/>
  <ellipse cx="346" cy="232" rx="9" ry="5" fill="rgba(230,80,110,0.5)"/>
  <ellipse cx="422" cy="232" rx="9" ry="5" fill="rgba(230,80,110,0.5)"/>
  <rect x="24" y="24" width="${name.length * 11 + 110}" height="36" rx="18" fill="#FFFDF7" stroke="#3B2A1E" stroke-width="2"/>
  <text x="42" y="48" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="17" fill="#3B2A1E">${escape(name)} sketch</text>
  <text x="384" y="380" text-anchor="middle" font-family="Caveat, 'Comic Sans MS', cursive" font-size="38" fill="#5E4836">imagine the scene happening right here</text>
</svg>`;
  return { buffer: Buffer.from(svg), ext: 'svg' };
}
