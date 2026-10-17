// Anything can open the About dialog by calling openAbout(); the Settings
// panel (on every page) listens for it and shows the dialog.
export const openAbout = () => dispatchEvent(new Event('uf-mp:about'))
