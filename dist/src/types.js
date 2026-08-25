/*
 * The vocabulary this package is about.
 *
 * Everything here is deliberately *abstract*. The whole reason two apps can
 * share these state machines is that the machines never decide what goes on
 * the wire — they decide what *should happen*, and each app's own encoder
 * turns that into bytes. naru-remote wraps a chord of X11 keysyms in an RFB
 * KeyEvent; gadak's phone writes a single control byte into a PTY. There is
 * no shared encoding of "Ctrl-C" between those two, and pretending there is
 * would be the mistake this boundary exists to prevent.
 */
export const MODIFIER_IDS = ['control', 'alt', 'shift', 'meta'];
/** Sorted, so an intent's mods compare equal regardless of arrival order. */
export function sortMods(mods) {
    const seen = new Set(mods);
    return MODIFIER_IDS.filter((m) => seen.has(m));
}
