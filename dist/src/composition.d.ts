import type { Intent, ModifierId } from './types.js';
export type CompositionEvent = {
    type: 'compose-start';
}
/** A candidate. Never emitted; never latches the gate. */
 | {
    type: 'compose-update';
    text: string;
}
/** Committed. Empty text means the candidate was dismissed. */
 | {
    type: 'compose-end';
    text: string;
}
/** A plain insert, from a keyboard that is not composing. */
 | {
    type: 'plain';
    text: string;
};
export declare class CompositionGate {
    private open;
    get composing(): boolean;
    /**
     * `mods` are the sticky modifiers active right now (M1). They ride the
     * committed text, which sounds odd until you remember that on a shell
     * Ctrl-armed followed by a typed letter is how a person sends Ctrl-C from
     * a touchscreen.
     */
    next(ev: CompositionEvent, mods?: ModifierId[]): Intent[];
    /** Session teardown. A gate left open across a reconnect swallows input. */
    reset(): void;
}
