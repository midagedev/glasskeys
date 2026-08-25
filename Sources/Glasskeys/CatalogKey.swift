/// The keys `catalog/keys.json` names, and whether holding one repeats.
///
/// This is the shipped answer for an app that has no key enum of its own. An
/// app that does — because its keys carry a wire encoding, an X11 keysym or a
/// control byte — conforms *that* type to ``RepeatableKey`` instead and never
/// touches this one. Identity and repeat behaviour are shared; labels, glyphs,
/// strip order, accessibility copy and every byte are not.
///
/// `GlasskeysTests` asserts this enum against `catalog/keys.json`, so the data
/// file and the Swift type cannot drift apart.
public enum CatalogKey: String, Sendable, Equatable, Hashable, CaseIterable, Codable {
    case escape
    case tab
    case home
    case end
    case pageUp
    case pageDown
    case insert
    case delete
    case arrowUp
    case arrowDown
    case arrowLeft
    case arrowRight
}

extension CatalogKey: RepeatableKey {
    /// Arrows and Delete repeat. Escape, Tab, Home, End, Page keys and Insert
    /// fire once — holding those is destructive rather than useful, which is a
    /// behaviour contract rather than a preference, so it lives with the key
    /// identity instead of in each app.
    public var repeats: Bool {
        switch self {
        case .delete, .arrowUp, .arrowDown, .arrowLeft, .arrowRight:
            return true
        case .escape, .tab, .home, .end, .pageUp, .pageDown, .insert:
            return false
        }
    }
}
