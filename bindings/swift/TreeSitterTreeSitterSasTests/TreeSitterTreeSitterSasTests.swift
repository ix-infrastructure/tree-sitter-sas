import XCTest
import SwiftTreeSitter
import TreeSitterTreeSitterSas

final class TreeSitterTreeSitterSasTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_tree_sitter_sas())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading SAS grammar")
    }
}
