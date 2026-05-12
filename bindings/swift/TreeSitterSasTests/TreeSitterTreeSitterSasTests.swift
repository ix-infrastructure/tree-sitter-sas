import XCTest
import SwiftTreeSitter
import TreeSitterSas

final class TreeSitterSasTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_sas())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading SAS grammar")
    }
}
