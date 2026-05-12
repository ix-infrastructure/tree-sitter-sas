/**
 * @file SAS language grammar for tree-sitter
 * @author Brandon Garate <bgarate@ix-infra.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "tree_sitter_sas",

  rules: {
    // TODO: add the actual grammar rules
    source_file: $ => "hello"
  }
});
