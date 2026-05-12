/**
 * @file SAS language grammar for tree-sitter
 * @author Brandon Garate <bgarate@ix-infra.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Build a case-insensitive regex for a keyword (ASCII letters only).
function kw(word) {
  return new RegExp(
    word.split("").map(c => `[${c.toLowerCase()}${c.toUpperCase()}]`).join("")
  );
}

// Single lexer token for "%KEYWORD" — beats the 1-char "%" used by macro_call
// on length, so the lexer always picks the correct rule.
// Known limitation: macros whose names start with a reserved keyword prefix
// (e.g. %let2, %macroFoo) will not parse correctly. Extremely rare in practice.
function percentKw(word) {
  return token(seq("%", kw(word)));
}

export default grammar({
  name: "sas",

  extras: $ => [
    /\s+/,
    $.block_comment,
    $.percent_comment,
  ],

  word: $ => $.identifier,

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

    // /* ... */ — an extra so it is transparently skipped between any two tokens
    block_comment: $ => token(seq(
      "/*",
      /[^*]*\*+([^/*][^*]*\*+)*/,
      "/",
    )),

    // %* text ; — SAS macro language comment; an extra like block_comment
    // The %* combined token (2 chars) beats the 1-char % used by macro rules.
    percent_comment: $ => token(seq("%*", /[^;]*/, ";")),

    // * text ; — single token so the lexer beats generic_statement on `*`
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
      seq($.identifier, ".", $.identifier),
      alias(
        token(choice("_NULL_", "_null_", "_DATA_", "_data_", "_LAST_", "_last_")),
        $.identifier
      ),
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
      $.macro_definition,
      $.macro_variable_assignment,
      $.include_statement,
      $.macro_call_statement,
      $.line_comment,
      $.generic_statement,
    ),

    // ── Macro definition ──────────────────────────────────────────────────

    macro_definition: $ => seq(
      percentKw("MACRO"),
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
      $.macro_call,
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
      percentKw("MEND"),
      optional($.macro_name),
      ";",
    ),

    macro_name: $ => $.identifier,

    // ── Macro call ────────────────────────────────────────────────────────

    // Standalone statement: %name(args);   %name;   %name content;
    // The third form handles SAS built-ins that take non-parenthesized content:
    //   %put text;   %do i = 1 %to &n;   %if cond %then stmt;   %global x y;
    macro_call_statement: $ => seq(
      "%",
      field("name", alias(token.immediate(/[A-Za-z_][A-Za-z0-9_]*/), $.macro_name)),
      choice(
        seq($.macro_arguments, ";"),            // %name(args);
        ";",                                    // %name;
        seq(repeat1($._mc_tok), ";"),           // %name content; (non-parenthesized)
      ),
    ),

    // Inline call used as a value inside other constructs
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

    // Tokens inside non-paren macro statement content (e.g. %put, %do, %if).
    // Parens excluded from the bare-token pattern so %name(args) uses
    // macro_arguments (option 1 of macro_call_statement) unambiguously.
    _mc_tok: $ => choice(
      $.string_literal,
      $.macro_variable_ref,
      $.macro_call,
      /[^;%()\s"'&]+/,
    ),

    // ── %LET ──────────────────────────────────────────────────────────────

    macro_variable_assignment: $ => seq(
      percentKw("LET"),
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
      percentKw("INCLUDE"),
      field("source", $.string_literal),
      repeat($._option_token),
      ";",
    ),

    // ── LIBNAME ───────────────────────────────────────────────────────────

    // Everything after libref kept flat — Ix query finds string_literal by position.
    libname_statement: $ => seq(
      kw("LIBNAME"),
      field("libref", $.identifier),
      repeat($._libname_token),
      ";",
    ),

    _libname_token: $ => choice(
      $.string_literal,
      $.macro_variable_ref,
      /[^;\s"'&%]+/,
    ),

    // ── OPTIONS ───────────────────────────────────────────────────────────

    options_statement: $ => seq(
      kw("OPTIONS"),
      repeat($._option_token),
      ";",
    ),

    _option_token: $ => choice(
      $.macro_variable_ref,
      /[^;\/\s"'&%]+/,
      /=\s*/,
    ),

    // ── Generic fallback statement ────────────────────────────────────────

    // Does NOT contain macro_call — all %-prefixed statements go to the
    // specific macro rules above. This prevents generic_statement from
    // swallowing %LET / %INCLUDE / etc. before they can be recognised.
    generic_statement: $ => seq(
      choice(
        $.string_literal,
        $.macro_variable_ref,
        /[^;%\/\s"'&]+/,
        /\//,
      ),
      repeat(choice(
        $.string_literal,
        $.macro_variable_ref,
        /[^;%\/\s"'&]+/,
        /\//,
      )),
      ";",
    ),

    // ── Primitives ────────────────────────────────────────────────────────

    // &var or &&var; optional trailing dot is the macro separator
    macro_variable_ref: $ => token(seq(
      /&&?/,
      /[A-Za-z_][A-Za-z0-9_]*/,
      repeat(/\./)
    )),

    identifier: $ => /[A-Za-z_][A-Za-z0-9_]*/,

    // Single or double quoted; quote char escaped by doubling
    string_literal: $ => choice(
      seq("'", repeat(choice(/[^']+/, "''")), "'", optional($._string_suffix)),
      seq('"', repeat(choice(/[^"]+/, '""')), '"', optional($._string_suffix)),
    ),

    // Typed constant suffix — must immediately follow closing quote (no space):
    // b=bit, d=date, dt=datetime, n=name-literal, t=time, x=hex-char
    _string_suffix: $ => token.immediate(/[BbDdNnTtXx][Tt]?/),

    // Decimal, scientific, or SAS hex numeric
    numeric_literal: $ => token(choice(
      /[0-9]+(\.[0-9]*)?([eE][+-]?[0-9]+)?/,
      /\.[0-9]+([eE][+-]?[0-9]+)?/,
      /[0-9A-Fa-f]+[Xx]/,
    )),
  },
});
