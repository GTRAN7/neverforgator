// Which app mode this browser is in: 'studio' (the 3D NeverForgator studio) or 'campus' (the
// campus walk). Kept in localStorage so it survives the Auth0 login redirect, which always comes
// back to the plain origin. ?mode=campus or ?mode=studio in the URL switches too.
const KEY = 'neverforgator-mode'

export function currentMode() {
  const fromUrl = new URLSearchParams(window.location.search).get('mode')
  try {
    if (fromUrl === 'campus' || fromUrl === 'studio') localStorage.setItem(KEY, fromUrl)
    return localStorage.getItem(KEY) === 'campus' ? 'campus' : 'studio'
  } catch {
    return fromUrl === 'campus' ? 'campus' : 'studio'
  }
}

export function switchMode(mode) {
  try { localStorage.setItem(KEY, mode) } catch { /* the URL below still switches */ }
  window.location.href = `/?mode=${mode}`
}
