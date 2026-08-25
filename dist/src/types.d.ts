/** The four modifier slots. An app may implement fewer (a PTY has no Meta). */
export type ModifierId = 'control' | 'alt' | 'shift' | 'meta';
export declare const MODIFIER_IDS: readonly ModifierId[];
/**
 * A named key from the catalog (`catalog/keys.json`) — `escape`, `arrowUp`,
 * `home`. Not a character: typed text arrives as `emit-text`, because the
 * two are encoded differently on both ends.
 *
 * Left as a string rather than a union so an app can carry keys the shared
 * catalog does not name (gadak has `pipe`/`tilde`; naru has F1–F12). The
 * catalog is what conformance runs on; the extras are each app's business.
 */
export type KeyId = string;
/**
 * What a machine decides. An app reads these and encodes them.
 *
 * `withhold` is not "do nothing" — it is "this input was consumed on purpose
 * and must not reach the far end", which is a different claim and one worth
 * being able to assert in a test.
 */
export type Intent = {
    op: 'emit-key';
    key: KeyId;
    mods: ModifierId[];
} | {
    op: 'emit-text';
    text: string;
    mods: ModifierId[];
} | {
    op: 'withhold';
}
/** A local composition is open and must be finalized before the next emit. */
 | {
    op: 'commit-marked';
}
/** The control is abandoned. Sticky state and any draft are left alone. */
 | {
    op: 'drop-control';
} | {
    op: 'schedule-tick';
    atMs: number;
} | {
    op: 'clear-schedule';
};
/** Sorted, so an intent's mods compare equal regardless of arrival order. */
export declare function sortMods(mods: Iterable<ModifierId>): ModifierId[];
