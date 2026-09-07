//! This crate provides SAS language support for the [tree-sitter] parsing library.
//!
//! Typically, you will use the [`LANGUAGE`] constant to add this language to a
//! tree-sitter [`Parser`], and then use the parser to parse some code:
//!
//! ```
//! let code = r#"
//! data work.example;
//!   set sashelp.class;
//!   bmi = weight / (height * height);
//! run;
//! "#;
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_sas::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading SAS parser");
//! let tree = parser.parse(code, None).unwrap();
//! let root = tree.root_node();
//! assert!(!root.has_error());
//! // Assert the shape, not just the absence of an error: the empty program
//! // this snippet used to contain parsed to zero named children, so
//! // `!has_error()` held vacuously and nothing exercised the grammar.
//! assert_eq!(root.named_child_count(), 1);
//! assert_eq!(root.named_child(0).unwrap().kind(), "data_step");
//! ```
//!
//! [`Parser`]: https://docs.rs/tree-sitter/0.27.0/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_sas() -> *const ();
}

/// The tree-sitter [`LanguageFn`] for this grammar.
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_sas) };

/// The content of the [`node-types.json`] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

#[cfg(with_highlights_query)]
/// The syntax highlighting query for this grammar.
pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");

#[cfg(with_injections_query)]
/// The language injection query for this grammar.
pub const INJECTIONS_QUERY: &str = include_str!("../../queries/injections.scm");

#[cfg(with_locals_query)]
/// The local variable query for this grammar.
pub const LOCALS_QUERY: &str = include_str!("../../queries/locals.scm");

#[cfg(with_tags_query)]
/// The symbol tagging query for this grammar.
pub const TAGS_QUERY: &str = include_str!("../../queries/tags.scm");

#[cfg(test)]
mod tests {
    #[test]
    fn test_can_load_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading SAS parser");
    }
}
