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

/** The four modifier slots. An app may implement fewer (a PTY has no Meta). */
export type ModifierId = 'control' | 'alt' | 'shift' | 'meta'

export const MODIFIER_IDS: readonly ModifierId[] = ['control', 'alt', 'shift', 'meta']

/**
 * A named key from the catalog (`catalog/keys.json`) — `escape`, `arrowUp`,
 * `home`. Not a character: typed text arrives as `emit-text`, because the
 * two are encoded differently on both ends.
 *
 * Left as a string rather than a union so an app can carry keys the shared
 * catalog does not name (gadak has `pipe`/`tilde`; naru has F1–F12). The
 * catalog is what conformance runs on; the extras are each app's business.
 */
export type KeyId = string

/**
 * What a machine decides. An app reads these and encodes them.
 *
 * `withhold` is not "do nothing" — it is "this input was consumed on purpose
 * and must not reach the far end", which is a different claim and one worth
 * being able to assert in a test.
 */
export type Intent =
  | { op: 'emit-key'; key: KeyId; mods: ModifierId[] }
  | { op: 'emit-text'; text: string; mods: ModifierId[] }
  | { op: 'withhold' }
  /** A local composition is open and must be finalized before the next emit. */
  | { op: 'commit-marked' }
  /** The control is abandoned. Sticky state and any draft are left alone. */
  | { op: 'drop-control' }
  | { op: 'schedule-tick'; atMs: number }
  | { op: 'clear-schedule' }

/** Sorted, so an intent's mods compare equal regardless of arrival order. */
export function sortMods(mods: Iterable<ModifierId>): ModifierId[] {
  const seen = new Set(mods)
  return MODIFIER_IDS.filter((m) => seen.has(m))
}
