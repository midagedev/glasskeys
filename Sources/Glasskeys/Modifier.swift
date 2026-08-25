/// The four modifiers a soft keyboard can offer.
///
/// `allCases` is the canonical order the golden vectors use for `active` and
/// `mods` lists. It is not alphabetical and not the strip order any particular
/// app draws — an app orders its own buttons; this order exists so two
/// implementations comparing modifier lists compare the same list.
public enum Modifier: String, Sendable, Equatable, Hashable, CaseIterable, Codable {
    case control
    case alt
    case shift
    case meta

    /// Sorts modifiers into the canonical order, dropping duplicates.
    public static func canonical<S: Sequence>(_ modifiers: S) -> [Modifier]
    where S.Element == Modifier {
        let present = Set(modifiers)
        return allCases.filter(present.contains)
    }
}
