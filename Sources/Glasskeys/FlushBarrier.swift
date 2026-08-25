/// M4 — the flush barrier.
///
/// The bug this closes is easy to miss and impossible to unsee. A person is
/// mid-composition — a Korean syllable half built — and taps Esc on the key
/// bar. Two things are now racing: the local IME still holds an uncommitted
/// character, and a control byte is on its way to the far end. Whichever order
/// they land in, one of them is wrong: either the escape arrives inside the
/// word, or the word arrives after the escape that was meant to cancel
/// whatever came before it.
///
/// The order is: commit what is held, *then* emit the control. Never the
/// reverse, and never both at once.
///
/// The second half is for apps whose text insertion can fail — one that
/// inserts through a helper process or the clipboard can lose the text, and
/// then the control must be dropped rather than sent on top of text that never
/// arrived. An app writing straight into a PTY passes ``PendingFlush/notNeeded``
/// forever and never sees that branch.
///
/// Note what is *not* here: sticky state. A dropped control does not spend an
/// armed modifier, because from the user's point of view the key never
/// happened.
public enum FlushBarrier: Sendable {

    public enum PendingFlush: Sendable, Equatable {
        /// Nothing was in flight — the app writes directly to the far end, or
        /// its key lane is already ordered.
        case notNeeded
        case succeeded
        case failed
    }

    public enum Step: Sendable, Equatable {
        case commitMarkedText
        case emitControl
        case dropControl
    }

    /// The ordered steps for one control-key press. Execute them in order; a
    /// caller that reorders them has reintroduced the race.
    public static func steps(
        hasMarkedText: Bool,
        pendingFlush: PendingFlush
    ) -> [Step] {
        var steps: [Step] = []
        if hasMarkedText {
            steps.append(.commitMarkedText)
        }
        steps.append(pendingFlush == .failed ? .dropControl : .emitControl)
        return steps
    }

    /// The same decision as a boolean, for a call site that has already
    /// committed the composition and only needs to know whether to send.
    ///
    /// Kept as its own entry point rather than a comment on ``steps(hasMarkedText:pendingFlush:)``
    /// because both shapes exist in the wild: one call site builds a step list,
    /// the other awaits an in-flight insert and then asks a yes/no question.
    public static func shouldEmitAfterFlush(succeeded: Bool) -> Bool {
        succeeded
    }
}
