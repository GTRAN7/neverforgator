"""Placeholder "pictures": an SVG sketch card in the app's style instead of a generated image.
Free and instant. Used with PICTURES=placeholder, with no API key, or when Gemini is busy."""
from html import escape

FRIEND_COLORS = ["#FFB38A", "#8CCBFF", "#FFD86B", "#8FE3C6", "#C7B5FF", "#FF9EC4"]
SKIES = {
    "storybook": ("#BFE0EA", "#FBF4E6"),
    "claymation": ("#FFD9B8", "#F3E3C8"),
    "sticker": ("#E3EEDF", "#FFFDF7"),
    "pixel": ("#C7B5FF", "#F1E5CF"),
}
STYLE_NAMES = {"storybook": "storybook", "claymation": "claymation", "sticker": "sticker", "pixel": "pixel art"}


def placeholder_image(prompt: str, style: str = "storybook"):
    """The card already prints the scene text, so the sketch is just a friend in a little
    scene plus the picture style. The prompt only picks the friend's color."""
    seed = 7
    for ch in prompt:
        seed = (seed * 31 + ord(ch)) & 0xFFFFFFFF
    body = FRIEND_COLORS[seed % len(FRIEND_COLORS)]
    sky, ground = SKIES.get(style, SKIES["storybook"])
    name = STYLE_NAMES.get(style, "storybook")
    pixel = style == "pixel"
    blob = (
        f'<rect x="314" y="150" width="140" height="124" fill="{body}" stroke="#3B2A1E" stroke-width="6"/>'
        if pixel else
        f'<path d="M384 144 C 452 144 470 194 470 224 C 470 264 432 278 384 278 C 336 278 298 264 298 224 '
        f'C 298 194 316 144 384 144 Z" fill="{body}" stroke="#3B2A1E" stroke-width="6"/>'
    )
    # 768x468 matches the polaroid's photo slot, so nothing gets cropped.
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="768" height="468" viewBox="0 0 768 468"{' shape-rendering="crispEdges"' if pixel else ''}>
  <rect width="768" height="468" fill="{sky}"/>
  <rect y="290" width="768" height="178" fill="{ground}"/>
  <ellipse cx="384" cy="300" rx="150" ry="20" fill="rgba(59,42,30,0.12)"/>
  <g fill="#FFD86B" stroke="#3B2A1E" stroke-width="3" stroke-linejoin="round">
    <path d="M170 110 l8 24 24 8 -24 8 -8 24 -8 -24 -24 -8 24 -8z"/>
    <path d="M600 80 l6 18 18 6 -18 6 -6 18 -6 -18 -18 -6 18 -6z"/>
    <path d="M630 210 l5 14 14 5 -14 5 -5 14 -5 -14 -14 -5 14 -5z"/>
  </g>
  {blob}
  <ellipse cx="362" cy="208" rx="7" ry="10" fill="#3B2A1E"/>
  <ellipse cx="406" cy="208" rx="7" ry="10" fill="#3B2A1E"/>
  <ellipse cx="346" cy="232" rx="9" ry="5" fill="rgba(230,80,110,0.5)"/>
  <ellipse cx="422" cy="232" rx="9" ry="5" fill="rgba(230,80,110,0.5)"/>
  <rect x="24" y="24" width="{len(name) * 11 + 110}" height="36" rx="18" fill="#FFFDF7" stroke="#3B2A1E" stroke-width="2"/>
  <text x="42" y="48" font-family="Fredoka, Nunito, sans-serif" font-weight="600" font-size="17" fill="#3B2A1E">{escape(name)} sketch</text>
  <text x="384" y="380" text-anchor="middle" font-family="Caveat, 'Comic Sans MS', cursive" font-size="38" fill="#5E4836">imagine the scene happening right here</text>
</svg>"""
    return svg.encode(), "svg"
