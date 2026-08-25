import XCTest
@testable import Glasskeys

/// The golden vectors, run against the Swift implementation.
///
/// `vectors/**/*.json` is the specification; `Sources/Glasskeys` and `src/` are
/// two implementations of it. `npm test` runs these same files against the
/// TypeScript one. There is no shared compiled artifact between them and there
/// cannot be, so these files are the entire mechanism keeping the two honest.
///
/// A suite with no runner here is a failure, never a skip — a harness that
/// silently skipped what it could not run would report green while pinning
/// nothing. Unlike a consuming app, this target implements all four machines,
/// so there are no named skips at all.
final class GoldenVectorTests: XCTestCase {

    private static let runnerSuites: Set<String> = ["sticky", "cadence", "flush", "composition"]

    // MARK: - Contract

    func testEverySuiteHasARunner() throws {
        let vectors = try Self.loadVectors()
        XCTAssertFalse(vectors.isEmpty, "vectors/ must not be empty")
        let unknown = Set(vectors.map(\.suite)).subtracting(Self.runnerSuites)
        XCTAssertEqual(unknown, [], "suites with no runner: \(unknown.sorted())")
    }

    /// The vector set is the manifest's, not most of it.
    ///
    /// A missing vector only makes the run smaller, and a smaller green run
    /// reads exactly like a complete one — which is how a copy of `vectors/`
    /// in another repo loses a file unnoticed.
    func testVectorSetMatchesTheManifest() throws {
        let data = try Data(contentsOf: Self.repoRoot.appendingPathComponent("vectors/MANIFEST.json"))
        let manifest = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let expected = try XCTUnwrap(manifest["vectors"] as? [String])
        let loaded = try Self.loadVectors().map { "\($0.suite)/\($0.id)" }.sorted()
        XCTAssertEqual(loaded, expected, "run `npm run manifest`")
    }

    func testEveryVectorNamesWhereItCameFrom() throws {
        var seen: Set<String> = []
        for vector in try Self.loadVectors() {
            let key = "\(vector.suite)/\(vector.id)"
            XCTAssertFalse(vector.sourceRepo.isEmpty, "\(key): source.repo")
            XCTAssertFalse(vector.steps.isEmpty, "\(key): steps")
            XCTAssertTrue(seen.insert(key).inserted, "duplicate id \(key)")
        }
    }

    /// The Swift enum and `catalog/keys.json` are the same catalog.
    func testCatalogKeyMatchesTheDataFile() throws {
        let data = try Data(contentsOf: Self.repoRoot.appendingPathComponent("catalog/keys.json"))
        let catalog = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let keys = try XCTUnwrap(catalog["keys"] as? [[String: Any]])

        XCTAssertEqual(
            keys.compactMap { $0["id"] as? String }.sorted(),
            CatalogKey.allCases.map(\.rawValue).sorted(),
            "CatalogKey and catalog/keys.json name different keys"
        )
        for entry in keys {
            let id = try XCTUnwrap(entry["id"] as? String)
            let key = try XCTUnwrap(CatalogKey(rawValue: id))
            XCTAssertEqual(key.repeats, entry["repeatable"] as? Bool, "\(id): repeatable")
        }
        XCTAssertEqual(
            catalog["modifiers"] as? [String],
            Modifier.allCases.map(\.rawValue),
            "the catalog's modifier order is the canonical one"
        )
    }

    // MARK: - Suites

    func testStickyVectors() throws {
        for vector in try Self.loadVectors(suite: "sticky") {
            var state = StickyModifiers()
            let t0 = ContinuousClock.now
            for (index, step) in vector.steps.enumerated() {
                let at = "\(vector.id) step \(index) (t=\(step.t))"
                switch try step.string("op") {
                case "tap":
                    state.tap(try Self.modifier(step.string("mod")), at: t0.advanced(by: .milliseconds(step.t)))
                case "consume":
                    state.consume()
                case "clear":
                    state.clear()
                case "noop":
                    break
                case let op:
                    return XCTFail("\(at): unknown sticky op \"\(op)\"")
                }
                if let slots = step.expect["slots"] as? [String: Any] {
                    for (name, want) in slots {
                        XCTAssertEqual(state.slot(for: try Self.modifier(name)).rawValue, want as? String, "\(at): slot \(name)")
                    }
                }
                if let active = Self.strings(step.expect["active"]) {
                    XCTAssertEqual(state.activeModifiers.map(\.rawValue), active, "\(at): active")
                }
            }
        }
    }

    func testCadenceVectors() throws {
        for vector in try Self.loadVectors(suite: "cadence") {
            var cadence = RepeatCadence<CatalogKey>()
            let t0 = ContinuousClock.now
            for (index, step) in vector.steps.enumerated() {
                let at = "\(vector.id) step \(index) (t=\(step.t))"
                let now = t0.advanced(by: .milliseconds(step.t))
                let mods = Modifier.canonical(Self.modifiers(step.input["mods"]))
                var got: [Intent] = []
                switch try step.string("op") {
                case "press":
                    let key = try XCTUnwrap(CatalogKey(rawValue: step.string("key")), at)
                    got = Self.intents(cadence.press(key, at: now), mods: mods, t0: t0)
                case "tick":
                    got = Self.intents(cadence.tick(at: now), mods: mods, t0: t0)
                case "release":
                    // `release()` returns nothing in Swift; the vectors expect
                    // a `clear-schedule` when a key was held. That belongs to
                    // the adapter, not to the machine.
                    let wasHeld = cadence.heldKey != nil
                    cadence.release()
                    got = wasHeld ? [.clearSchedule] : []
                case "stop":
                    cadence.stop()
                case let op:
                    return XCTFail("\(at): unknown cadence op \"\(op)\"")
                }
                if step.expect["intents"] != nil {
                    XCTAssertEqual(got, try Self.expectedIntents(step.expect["intents"]), "\(at): intents")
                }
                if step.expect.keys.contains("held") {
                    XCTAssertEqual(cadence.heldKey?.rawValue, step.expect["held"] as? String, "\(at): held")
                }
            }
        }
    }

    func testFlushVectors() throws {
        for vector in try Self.loadVectors(suite: "flush") {
            for (index, step) in vector.steps.enumerated() {
                let at = "\(vector.id) step \(index)"
                XCTAssertEqual(try step.string("op"), "control", "\(at): op")
                let key = try step.string("key")
                let mods = Modifier.canonical(Self.modifiers(step.input["mods"]))
                let got = FlushBarrier.steps(
                    hasMarkedText: try step.bool("hasMarked"),
                    pendingFlush: try Self.pending(step.string("pending"))
                ).map { barrierStep -> Intent in
                    switch barrierStep {
                    case .commitMarkedText: return .commitMarked
                    case .emitControl: return .emitKey(key, mods: mods)
                    case .dropControl: return .dropControl
                    }
                }
                XCTAssertEqual(got, try Self.expectedIntents(step.expect["intents"]), "\(at): intents")
            }
        }
    }

    func testCompositionVectors() throws {
        for vector in try Self.loadVectors(suite: "composition") {
            var gate = CompositionGate()
            for (index, step) in vector.steps.enumerated() {
                let at = "\(vector.id) step \(index)"
                let mods = Modifier.canonical(Self.modifiers(step.input["mods"]))
                let text = step.input["text"] as? String ?? ""
                let event: CompositionEvent
                switch try step.string("op") {
                case "compose-start": event = .composeStart
                case "compose-update": event = .composeUpdate(text: text)
                case "compose-end": event = .composeEnd(text: text)
                case "plain": event = .plain(text: text)
                case let op: return XCTFail("\(at): unknown composition op \"\(op)\"")
                }
                let got = gate.next(event, modifiers: mods).map { intent -> Intent in
                    switch intent {
                    case .withhold: return .withhold
                    case .emitText(let text, let modifiers): return .emitText(text, mods: modifiers)
                    }
                }
                if step.expect["intents"] != nil {
                    XCTAssertEqual(got, try Self.expectedIntents(step.expect["intents"]), "\(at): intents")
                }
                if step.expect.keys.contains("composing") {
                    XCTAssertEqual(gate.composing, step.expect["composing"] as? Bool, "\(at): composing")
                }
            }
        }
    }

    // MARK: - Intents

    private enum Intent: Equatable, CustomStringConvertible {
        case emitKey(String, mods: [Modifier])
        case emitText(String, mods: [Modifier])
        case withhold
        case commitMarked
        case dropControl
        case clearSchedule
        case scheduleTick(milliseconds: Int)

        var description: String {
            switch self {
            case .emitKey(let key, let mods): return "emit-key \(key) \(mods.map(\.rawValue))"
            case .emitText(let text, let mods): return "emit-text \(text) \(mods.map(\.rawValue))"
            case .withhold: return "withhold"
            case .commitMarked: return "commit-marked"
            case .dropControl: return "drop-control"
            case .clearSchedule: return "clear-schedule"
            case .scheduleTick(let ms): return "schedule-tick @\(ms)"
            }
        }
    }

    private static func intents(
        _ tick: RepeatCadence<CatalogKey>.Tick,
        mods: [Modifier],
        t0: ContinuousClock.Instant
    ) -> [Intent] {
        var out: [Intent] = []
        if let key = tick.emit {
            out.append(.emitKey(key.rawValue, mods: mods))
        }
        if let next = tick.nextTickAt {
            out.append(.scheduleTick(milliseconds: milliseconds(from: t0, to: next)))
        }
        return out
    }

    private static func expectedIntents(_ any: Any?) throws -> [Intent] {
        guard let array = any as? [Any] else { throw VectorError.badValue("intents must be an array") }
        return try array.map { item in
            guard let object = item as? [String: Any], let op = object["op"] as? String else {
                throw VectorError.badValue("intent missing op")
            }
            let mods = Modifier.canonical(modifiers(object["mods"]))
            switch op {
            case "emit-key":
                return .emitKey(try string(object["key"], "emit-key.key"), mods: mods)
            case "emit-text":
                return .emitText(try string(object["text"], "emit-text.text"), mods: mods)
            case "withhold": return .withhold
            case "commit-marked": return .commitMarked
            case "drop-control": return .dropControl
            case "clear-schedule": return .clearSchedule
            case "schedule-tick":
                guard let ms = jsonInt(object["atMs"]) else { throw VectorError.badValue("schedule-tick.atMs") }
                return .scheduleTick(milliseconds: ms)
            default:
                throw VectorError.badValue("unknown intent op \"\(op)\"")
            }
        }
    }

    // MARK: - Loading

    private struct Vector {
        let suite: String
        let id: String
        let sourceRepo: String
        let steps: [Step]
    }

    private struct Step {
        let t: Int
        let input: [String: Any]
        let expect: [String: Any]

        func string(_ key: String) throws -> String {
            guard let value = input[key] as? String else { throw VectorError.badValue("in.\(key)") }
            return value
        }

        func bool(_ key: String) throws -> Bool {
            if let value = input[key] as? Bool { return value }
            if let number = input[key] as? NSNumber { return number.boolValue }
            throw VectorError.badValue("in.\(key)")
        }
    }

    private enum VectorError: Error, CustomStringConvertible {
        case badValue(String)
        var description: String {
            switch self { case .badValue(let message): return message }
        }
    }

    /// The repository root, from this file's own path — no bundle resources,
    /// so the vectors stay one copy at the root that both harnesses read.
    private static let repoRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // GlasskeysTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // repo root

    private static func loadVectors(suite: String? = nil) throws -> [Vector] {
        let root = repoRoot.appendingPathComponent("vectors")
        let fm = FileManager.default
        var out: [Vector] = []
        for entry in try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey]) {
            var isDirectory: ObjCBool = false
            guard fm.fileExists(atPath: entry.path, isDirectory: &isDirectory), isDirectory.boolValue else {
                continue // MANIFEST.json sits beside the suite directories
            }
            let suiteName = entry.lastPathComponent
            if let suite, suiteName != suite { continue }
            for file in try fm.contentsOfDirectory(at: entry, includingPropertiesForKeys: nil)
            where file.pathExtension == "json" {
                let object = try JSONSerialization.jsonObject(with: try Data(contentsOf: file))
                guard let vector = object as? [String: Any] else {
                    throw VectorError.badValue("\(file.lastPathComponent) is not an object")
                }
                guard vector["suite"] as? String == suiteName else {
                    throw VectorError.badValue("\(file.lastPathComponent): suite field disagrees with its directory")
                }
                guard let id = vector["id"] as? String,
                      let rawSteps = vector["steps"] as? [Any], !rawSteps.isEmpty
                else {
                    throw VectorError.badValue("\(file.lastPathComponent): id/steps")
                }
                let steps: [Step] = try rawSteps.map { item in
                    guard let step = item as? [String: Any],
                          let t = jsonInt(step["t"]),
                          let input = step["in"] as? [String: Any],
                          let expect = step["expect"] as? [String: Any]
                    else {
                        throw VectorError.badValue("\(suiteName)/\(id): malformed step")
                    }
                    return Step(t: t, input: input, expect: expect)
                }
                out.append(Vector(
                    suite: suiteName,
                    id: id,
                    sourceRepo: (vector["source"] as? [String: Any])?["repo"] as? String ?? "",
                    steps: steps
                ))
            }
        }
        return out.sorted { ($0.suite, $0.id) < ($1.suite, $1.id) }
    }

    // MARK: - JSON helpers

    private static func modifier(_ name: String) throws -> Modifier {
        guard let modifier = Modifier(rawValue: name) else {
            throw VectorError.badValue("unknown modifier \"\(name)\"")
        }
        return modifier
    }

    private static func modifiers(_ any: Any?) -> [Modifier] {
        (strings(any) ?? []).compactMap(Modifier.init(rawValue:))
    }

    private static func strings(_ any: Any?) -> [String]? {
        any as? [String]
    }

    private static func string(_ any: Any?, _ what: String) throws -> String {
        guard let value = any as? String else { throw VectorError.badValue(what) }
        return value
    }

    private static func jsonInt(_ any: Any?) -> Int? {
        if let int = any as? Int { return int }
        if let number = any as? NSNumber { return number.intValue }
        return nil
    }

    private static func pending(_ name: String) throws -> FlushBarrier.PendingFlush {
        switch name {
        case "not-needed": return .notNeeded
        case "succeeded": return .succeeded
        case "failed": return .failed
        default: throw VectorError.badValue("unknown pending \"\(name)\"")
        }
    }

    private static func milliseconds(
        from start: ContinuousClock.Instant,
        to end: ContinuousClock.Instant
    ) -> Int {
        let (seconds, attoseconds) = (end - start).components
        return Int(seconds * 1000 + attoseconds / 1_000_000_000_000_000)
    }
}
