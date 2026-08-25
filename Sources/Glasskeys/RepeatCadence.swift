/// A key that knows whether holding it should repeat.
///
/// The set lives in the catalog, not in the cadence: arrows and Delete repeat,
/// Escape / Tab / Home / End / the function keys fire once, because holding
/// those is destructive rather than useful. ``CatalogKey`` is the shipped
/// answer; an app with its own key enum conforms it instead and keeps its own
/// wire encoding.
public protocol RepeatableKey: Equatable, Sendable {
    var repeats: Bool { get }
}

/// M2 — hold-to-repeat for an on-screen key.
///
/// A hardware arrow key repeats when held. An on-screen one does not unless
/// somebody writes this, and the absence is felt immediately: moving a cursor
/// across a line of a shell becomes forty separate taps.
///
/// One emission on touch-down, then after 400 ms an emission every 45 ms. The
/// machine owns no timer — it reports the instant it wants to be called back
/// at, and the caller comes back with ``tick(at:)``. That is what makes the
/// 399/400 boundary testable, and what lets one implementation run on
/// `setTimeout` and the other on `Task.sleep`.
public struct RepeatCadence<Key: RepeatableKey>: Sendable, Equatable {

    /// Delay from touch-down to the first repeat.
    public static var initialDelay: Duration { .milliseconds(400) }
    /// Interval between repeats after the first.
    public static var repeatInterval: Duration { .milliseconds(45) }

    /// What a press or a tick produced: optionally a key to emit, optionally
    /// the next instant to call back at.
    public struct Tick: Sendable, Equatable {
        public var emit: Key?
        public var nextTickAt: ContinuousClock.Instant?

        public init(emit: Key?, nextTickAt: ContinuousClock.Instant?) {
            self.emit = emit
            self.nextTickAt = nextTickAt
        }

        public static var idle: Tick { Tick(emit: nil, nextTickAt: nil) }
    }

    /// The key currently held, if a repeatable press is in progress.
    public private(set) var heldKey: Key?
    private var nextFireAt: ContinuousClock.Instant?

    public init() {}

    public var isActive: Bool { heldKey != nil }

    /// Touch-down. **Always emits once**, repeatable or not — the first press
    /// is the press, and delaying it to see whether a hold develops is the
    /// latency people describe as "the keyboard feels laggy".
    public mutating func press(_ key: Key, at now: ContinuousClock.Instant) -> Tick {
        stop()
        guard key.repeats else {
            return Tick(emit: key, nextTickAt: nil)
        }
        heldKey = key
        let next = now.advanced(by: Self.initialDelay)
        nextFireAt = next
        return Tick(emit: key, nextTickAt: next)
    }

    /// An injected timer fired. Emits only once `now` has reached the
    /// deadline; an early tick re-reports the same deadline and emits nothing.
    ///
    /// A caller whose timer fires slightly early is normal — every platform's
    /// timers are approximate — and a machine that emitted on any tick at all
    /// would turn that jitter into a double keystroke.
    public mutating func tick(at now: ContinuousClock.Instant) -> Tick {
        guard let key = heldKey, let due = nextFireAt else {
            return .idle
        }
        guard now >= due else {
            return Tick(emit: nil, nextTickAt: due)
        }
        let next = now.advanced(by: Self.repeatInterval)
        nextFireAt = next
        return Tick(emit: key, nextTickAt: next)
    }

    /// Finger up.
    public mutating func release() {
        stop()
    }

    /// Teardown — the strip unmounted, the session ended, the app went to the
    /// background. Same effect as ``release()``, named differently because the
    /// call sites are different and one of them is an error path.
    public mutating func stop() {
        heldKey = nil
        nextFireAt = nil
    }
}
