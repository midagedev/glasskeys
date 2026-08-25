// swift-tools-version: 5.9
import PackageDescription

// The Swift half of glasskeys. Same four machines, same golden vectors, same
// constants as the TypeScript half — a phone app written in Swift and one
// written for a webview should not disagree about what a held arrow key does.
//
// There is no shared compiled artifact between the two and there cannot be, so
// `vectors/` is what keeps them honest: `swift test` and `npm test` read the
// same JSON files.
let package = Package(
    name: "Glasskeys",
    platforms: [.iOS(.v17), .macOS(.v14), .tvOS(.v17), .visionOS(.v1)],
    products: [
        .library(name: "Glasskeys", targets: ["Glasskeys"]),
    ],
    targets: [
        .target(name: "Glasskeys"),
        .testTarget(name: "GlasskeysTests", dependencies: ["Glasskeys"]),
    ]
)
