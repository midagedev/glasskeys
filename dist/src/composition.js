export class CompositionGate {
    open = false;
    get composing() {
        return this.open;
    }
    /**
     * `mods` are the sticky modifiers active right now (M1). They ride the
     * committed text, which sounds odd until you remember that on a shell
     * Ctrl-armed followed by a typed letter is how a person sends Ctrl-C from
     * a touchscreen.
     */
    next(ev, mods = []) {
        switch (ev.type) {
            case 'compose-start':
                this.open = true;
                return [{ op: 'withhold' }];
            case 'compose-update':
                // Not `this.open = true`. See the header: an update without a start
                // must not be able to wedge the gate.
                return [{ op: 'withhold' }];
            case 'compose-end':
                this.open = false;
                return ev.text === '' ? [] : [{ op: 'emit-text', text: ev.text, mods }];
            case 'plain':
                return this.open ? [{ op: 'withhold' }] : [{ op: 'emit-text', text: ev.text, mods }];
        }
    }
    /** Session teardown. A gate left open across a reconnect swallows input. */
    reset() {
        this.open = false;
    }
}
