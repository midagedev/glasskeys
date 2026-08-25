/// M1 — sticky modifiers.
///
/// A touchscreen has no Ctrl you can hold while pressing another key, so every
/// remote-input app invents a way to say "the next key is modified". The naive
/// version — a toggle — runs out immediately: you cannot hold Ctrl across
/// several keys without re-tapping it, and you cannot tell "armed for one key"
/// apart from "held".
///
/// The version that survives contact is three states per modifier, each slot
/// independent:
///
/// | Current slot | Time since last tap | New slot |
/// | ------------ | ------------------- | -------- |
/// | `idle`       | (any)               | `armed`  |
/// | `armed`      | ≤ 400 ms            | `locked` |
/// | `armed`      | > 400 ms            | `armed` (fresh tap; timestamp moves) |
/// | `locked`     | (any)               | `idle`   |
///
/// The boundary that matters: a modifier tap emits nothing, ever. It changes
/// what the *next* key means. Reading ``activeModifiers`` and then calling
/// ``consume()`` is how a caller applies that, and the two are separate calls
/// because "which modifiers" and "the emission actually happened" are answered
/// at different moments in every app that has tried this.
public struct StickyModifiers: Sendable, Equatable {

    public enum SlotState: String, Sendable, Equatable, Codable {
        case idle
        case armed
        case locked
    }

    /// The double-tap window, inclusive at the boundary: a second tap at
    /// exactly 400 ms locks, at 401 ms it re-arms.
    ///
    /// Not a tunable. It is a measured value from the app this machine shipped
    /// in first, and a value that differed between two consumers would make
    /// the shared vectors unrunnable — which is the only thing keeping the
    /// implementations honest.
    public static let lockWindow: Duration = .milliseconds(400)

    private var slots: [Modifier: SlotState] = [:]
    private var lastTapAt: [Modifier: ContinuousClock.Instant] = [:]

    public init() {}

    // MARK: - Queries

    public func slot(for modifier: Modifier) -> SlotState {
        slots[modifier] ?? .idle
    }

    /// Every modifier that is armed or locked, in canonical order.
    public var activeModifiers: [Modifier] {
        Modifier.allCases.filter { slot(for: $0) != .idle }
    }

    /// Every slot, for debug surfaces and tests.
    public var snapshot: [Modifier: SlotState] {
        Dictionary(uniqueKeysWithValues: Modifier.allCases.map { ($0, slot(for: $0)) })
    }

    // MARK: - Transitions

    /// The user tapped a modifier. Emits nothing by construction.
    ///
    /// `now` is injected rather than read from a clock so the 400 ms boundary
    /// is testable without sleeping, and so a replayed vector produces the same
    /// answer on both platforms.
    public mutating func tap(_ modifier: Modifier, at now: ContinuousClock.Instant) {
        switch slot(for: modifier) {
        case .locked:
            slots[modifier] = .idle
            lastTapAt[modifier] = nil
        case .armed:
            // Outside the window this is a fresh single tap, not a failed
            // lock: the timestamp moves so a third tap within 400 ms of *this*
            // one can still lock. Dropping that detail makes a slow double-tap
            // unlockable forever, which is how it reads to a person who tapped
            // a little late.
            if let last = lastTapAt[modifier], now - last <= Self.lockWindow {
                slots[modifier] = .locked
            } else {
                slots[modifier] = .armed
            }
            lastTapAt[modifier] = now
        case .idle:
            slots[modifier] = .armed
            lastTapAt[modifier] = now
        }
    }

    /// Call after a non-modifier emission actually happened. Armed slots are
    /// spent; locked slots survive.
    ///
    /// Deliberately not folded into a "press" method: an emission can fail, be
    /// dropped by the flush barrier (M4), or be withheld by a composition
    /// (M3), and in those cases the modifier must still be armed afterwards.
    /// Every app that merged the two ended up spending modifiers on keys that
    /// never left the device.
    public mutating func consume() {
        for modifier in Modifier.allCases where slots[modifier] == .armed {
            slots[modifier] = .idle
            lastTapAt[modifier] = nil
        }
    }

    /// Panic clear — everything to idle.
    ///
    /// This is not housekeeping. A locked modifier the user has forgotten
    /// about is the worst failure mode this machine has: on a shell, a stuck
    /// Ctrl turns ordinary typing into a stream of control codes and the way
    /// out is itself a control code. Any UI that offers lock must also offer
    /// this.
    public mutating func clear() {
        for modifier in Modifier.allCases {
            slots[modifier] = .idle
        }
        lastTapAt.removeAll()
    }
}
