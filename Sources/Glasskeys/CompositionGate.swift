/// What a composition event asks the caller to do.
public enum TextIntent: Sendable, Equatable {
    /// Nothing leaves the device. The character is not finished.
    case withhold
    /// Send this text, carrying the sticky modifiers that were active.
    case emitText(String, modifiers: [Modifier])
}

/// The four events every platform's IME can be reduced to.
///
/// Deliberately not UIKit's marked-text range and not the DOM's composition
/// events: each app adapts its own platform to these, and then the golden
/// vectors run against both apps.
public enum CompositionEvent: Sendable, Equatable {
    case composeStart
    /// A candidate. Never emitted, never latches the gate.
    case composeUpdate(text: String)
    /// Committed. Empty text means the candidate was dismissed.
    case composeEnd(text: String)
    /// A plain insert, from a keyboard that is not composing.
    case plain(text: String)
}

/// M3 — the composition gate.
///
/// An IME builds one character out of several keystrokes. Typing 안 is three
/// events that mean one syllable, and the intermediate states are candidates
/// the user has not chosen yet. Forward them and the far end receives ㅇ, ㅏ,
/// 안 — the word arrives three times over, each time wrong.
///
/// So: while a composition is open, emit nothing; when it commits, emit the
/// committed text once. That is the whole machine, and it is short enough that
/// both apps had *almost* written it — which is why it is here, because the
/// interesting part is where "almost" is wrong:
///
/// - An update never latches ``composing``. A platform that sends an update
///   without a start must not leave the gate stuck open forever.
/// - A commit with empty text is a *dismissed candidate*, not an empty insert.
///   Emit nothing, but do clear the gate.
/// - A stray commit with no start still clears and still emits. Refusing it
///   loses a real character on any platform whose start event is optional.
public struct CompositionGate: Sendable, Equatable {

    /// True while a composition is open.
    public private(set) var composing = false

    public init() {}

    /// `modifiers` are the sticky modifiers active right now (M1). They ride
    /// the committed text, which sounds odd until you remember that on a shell
    /// "Ctrl armed, then a typed letter" is how a person sends Ctrl-C from a
    /// touchscreen.
    public mutating func next(
        _ event: CompositionEvent,
        modifiers: [Modifier] = []
    ) -> [TextIntent] {
        switch event {
        case .composeStart:
            composing = true
            return [.withhold]
        case .composeUpdate:
            // Not `composing = true`. See the type doc: an update without a
            // start must not be able to wedge the gate.
            return [.withhold]
        case .composeEnd(let text):
            composing = false
            return text.isEmpty ? [] : [.emitText(text, modifiers: Modifier.canonical(modifiers))]
        case .plain(let text):
            return composing ? [.withhold] : [.emitText(text, modifiers: Modifier.canonical(modifiers))]
        }
    }

    /// Session teardown. A gate left open across a reconnect swallows input.
    public mutating func reset() {
        composing = false
    }
}
