/**
 * @file SAS language grammar for tree-sitter
 * @author Brandon Garate <bgarate@ix-infra.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Case-insensitive keyword helper
function kw(word) {
  return new RegExp(
    word.split("").map(c => `[${c.toLowerCase()}${c.toUpperCase()}]`).join("")
  );
}

export default grammar({
  name: "sas",

  extras: $ => [
    /\s+/,
    $.block_comment,
  ],

  word: $ => $.identifier,

  conflicts: $ => [
    [$.macro_call_statement, $.macro_call],
  ],

  rules: {
    // ── Top level ──────────────────────────────────────────────────────────

    program: $ => repeat($._top_level),

    _top_level: $ => choice(
      $.data_step,
      $.proc_step,
      $.macro_definition,
      $.macro_variable_assignment,
      $.include_statement,
      $.libname_statement,
      $.options_statement,
      $.macro_call_statement,
      $.line_comment,
      $.generic_statement,
    ),

    // ── Comments ───────────────────────────────────────────────────────────

    // /* ... */ block comment — handled as an extra so it can appear anywhere
    block_comment: $ => token(seq(
      "/*",
      /[^*]*\*+([^/*][^*]*\*+)*/,
      "/",
    )),

    // * text ; line comment — single token so lexer wins over generic fallback
    line_comment: $ => token(seq("*", /[^;]*/, ";")),

    // ── DATA step ──────────────────────────────────────────────────────────

    data_step: $ => seq(
      $.data_step_header,
      repeat($._step_statement),
      $.run_statement,
    ),

    data_step_header: $ => seq(
      kw("DATA"),
      optional($._dataset_list),
      ";",
    ),

    _dataset_list: $ => seq(
      $.dataset_name,
      repeat(seq(optional(","), $.dataset_name)),
    ),

    dataset_name: $ => choice(
      // two-level: libref.member
      seq($.identifier, ".", $.identifier),
      // special reserved names
      alias(token(choice("_NULL_", "_null_", "_DATA_", "_data_", "_LAST_", "_last_")), $.identifier),
      $.identifier,
    ),

    // ── PROC step ─────────────────────────────────────────────────────────

    proc_step: $ => seq(
      $.proc_step_header,
      repeat($._step_statement),
      $.run_or_quit_statement,
    ),

    proc_step_header: $ => seq(
      kw("PROC"),
      field("name", $.identifier),
      repeat($._option_token),
      ";",
    ),

    run_statement: $ => seq(kw("RUN"), ";"),

    run_or_quit_statement: $ => seq(choice(kw("RUN"), kw("QUIT")), ";"),

    // ── Step body ─────────────────────────────────────────────────────────

    _step_statement: $ => choice(
      $.macro_variable_assignment,
      $.include_statement,
      $.libname_statement,
      $.macro_call_statement,
      $.line_comment,
      $.generic_statement,
    ),

    // ── Macro definition ──────────────────────────────────────────────────

    macro_definition: $ => seq(
      "%",
      token.immediate(kw("MACRO")),
      field("name", $.macro_name),
      optional($.macro_parameters),
      ";",
      repeat($._macro_body_item),
      $.macro_end,
    ),

    macro_parameters: $ => seq(
      "(",
      optional(seq(
        $._macro_param,
        repeat(seq(",", $._macro_param)),
      )),
      ")",
    ),

    _macro_param: $ => seq(
      $.identifier,
      optional(seq("=", optional($._macro_param_default))),
    ),

    _macro_param_default: $ => repeat1(choice(
      $.string_literal,
      $.macro_variable_ref,
      /[^,);\s]+/,
    )),

    _macro_body_item: $ => choice(
      $.data_step,
      $.proc_step,
      $.macro_definition,
      $.macro_variable_assignment,
      $.include_statement,
      $.macro_call_statement,
      $.line_comment,
      $.generic_statement,
    ),

    macro_end: $ => seq(
      "%",
      token.immediate(kw("MEND")),
      optional($.macro_name),
      ";",
    ),

    macro_name: $ => $.identifier,

    // ── Macro call ────────────────────────────────────────────────────────

    // As a standalone statement: %name(...);  or  %name;
    macro_call_statement: $ => seq(
      "%",
      field("name", alias(token.immediate(/[A-Za-z_][A-Za-z0-9_]*/), $.macro_name)),
      optional($.macro_arguments),
      ";",
    ),

    // Inline macro call used as an expression/value
    macro_call: $ => seq(
      "%",
      field("name", alias(token.immediate(/[A-Za-z_][A-Za-z0-9_]*/), $.macro_name)),
      optional($.macro_arguments),
    ),

    macro_arguments: $ => seq(
      "(",
      optional(seq(
        $._macro_arg,
        repeat(seq(",", $._macro_arg)),
      )),
      ")",
    ),

    _macro_arg: $ => repeat1(choice(
      $.string_literal,
      $.macro_variable_ref,
      $.macro_call,
      /[^,();\s]+/,
    )),

    // ── %LET ──────────────────────────────────────────────────────────────

    macro_variable_assignment: $ => seq(
      "%",
      token.immediate(kw("LET")),
      field("name", $.identifier),
      "=",
      optional(field("value", $._macro_value)),
      ";",
    ),

    _macro_value: $ => repeat1(choice(
      $.string_literal,
      $.macro_variable_ref,
      $.macro_call,
      /[^;]+/,
    )),

    // ── %INCLUDE ──────────────────────────────────────────────────────────

    include_statement: $ => seq(
      "%",
      token.immediate(kw("INCLUDE")),
      field("source", $.string_literal),
      repeat($._option_token),
      ";",
    ),

    // ── LIBNAME ───────────────────────────────────────────────────────────

    // Captures: LIBNAME libref [engine] 'path' [options];
    // Everything after libref is collected as _libname_token so the
    // Ix query `(libname_statement (string_literal) @import.source)` works.
    libname_statement: $ => seq(
      kw("LIBNAME"),
      field("libref", $.identifier),
      repeat($._libname_token),
      ";",
    ),

    _libname_token: $ => choice(
      $.string_literal,
      $.macro_variable_ref,
      $.macro_call,
      /[^;\s"'&%]+/,
    ),

    // ── OPTIONS ───────────────────────────────────────────────────────────

    options_statement: $ => seq(
      kw("OPTIONS"),
      repeat($._option_token),
      ";",
    ),

    // Option tokens are identifier/value pairs (no string literals needed)
    _option_token: $ => choice(
      $.macro_variable_ref,
      $.macro_call,
      /[^;\/\s"'&%]+/,
      /=\s*/,
    ),

    // ── Generic fallback statement ────────────────────────────────────────

    // Catches any statement we don't specifically recognize
    generic_statement: $ => seq(
      repeat1(choice(
        $.string_literal,
        $.macro_variable_ref,
        $.macro_call,
        /[^;\/\s"'&%]+/,
        /\//,
      )),
      ";",
    ),

    // ── Primitives ────────────────────────────────────────────────────────

    // &var or &&var (double-ampersand for indirect reference)
    macro_variable_ref: $ => token(seq(
      /&&?/,
      /[A-Za-z_][A-Za-z0-9_]*/,
      repeat(/\./)
    )),

    // SAS identifier: [A-Za-z_][A-Za-z0-9_]* (max 32 bytes, not enforced here)
    identifier: $ => /[A-Za-z_][A-Za-z0-9_]*/,

    // String literals: single or double quoted, escaped by doubling the quote
    string_literal: $ => choice(
      // single-quoted
      seq(
        "'",
        repeat(choice(
          /[^']+/,
          "''",   // escaped single quote
        )),
        "'",
        optional($._string_suffix),
      ),
      // double-quoted (macro variables expand inside, treat as opaque for now)
      seq(
        '"',
        repeat(choice(
          /[^"]+/,
          '""',   // escaped double quote
        )),
        '"',
        optional($._string_suffix),
      ),
    ),

    // Typed constant suffixes: b (bit), d (date), dt (datetime), n (name literal),
    // t (time), x (hex char) — must immediately follow closing quote (no space)
    _string_suffix: $ => token.immediate(/[BbDdNnTtXx][Tt]?/),

    // Numeric literal: integer, decimal, scientific, SAS hex (0x...)
    numeric_literal: $ => token(choice(
      /[0-9]+(\.[0-9]*)?([eE][+-]?[0-9]+)?/,
      /\.[0-9]+([eE][+-]?[0-9]+)?/,
      /[0-9A-Fa-f]+[Xx]/,
    )),
  },
});
