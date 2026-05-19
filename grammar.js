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

// %KEYWORD disambiguation is handled by an external scanner (src/scanner.c).
// The scanner emits the $._pct_* tokens only when the keyword is NOT immediately
// followed by an identifier character — so %letput, %macroFoo, etc. fall through
// to macro_call_statement's plain "%" + identifier path instead.

export default grammar({
  name: "sas",

  // External tokens produced by src/scanner.c.
  // Each matches its %KEYWORD only when followed by a non-identifier character.
  externals: $ => [
    $._pct_let,      // %let
    $._pct_macro,    // %macro
    $._pct_mend,     // %mend
    $._pct_include,  // %include
    $._bare_pct,     // bare % not starting a macro call (e.g., width=20%)
  ],

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
      seq($._dname_part, ".", $._dname_part),
      alias(
        token(choice("_NULL_", "_null_", "_DATA_", "_data_", "_LAST_", "_last_")),
        $.identifier
      ),
      $._dname_part,
    ),

    // Dataset name part: identifier or macro ref, optionally followed by more macro refs.
    // Handles _w_&&memname&d, work.&&data&d, &&libname&d, etc.
    // prec.right: greedily consume consecutive macro_variable_refs into one part.
    _dname_part: $ => prec.right(seq(
      choice($.identifier, $.macro_variable_ref),
      repeat($.macro_variable_ref),
    )),

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
      $.null_statement,
      $.generic_statement,
    ),

    // Standalone semicolon — valid as a null/empty statement in SAS step bodies
    // and macro bodies (common after %if/%else blocks that span multiple lines).
    // prec(-1) makes it lose to macro_call_statement's optional ";" when ambiguous.
    null_statement: $ => prec(-1, ";"),

    // ── Macro definition ──────────────────────────────────────────────────

    macro_definition: $ => seq(
      $._pct_macro,
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
      $._paren_group,
      /[^,();\s"'&%]+/,
    )),

    _macro_body_item: $ => choice(
      $.data_step,
      $.proc_step,
      $.macro_definition,
      $.macro_variable_assignment,
      $.include_statement,
      $.macro_call_statement,
      $.macro_label,
      $.line_comment,
      $.null_statement,
      $.generic_statement,
    ),

    macro_end: $ => seq(
      $._pct_mend,
      optional($.macro_name),
      ";",
    ),

    // %label: — SAS macro goto label (no semicolon).  Disambiguated from
    // macro_call_statement via the conflicts declaration + GLR.
    macro_label: $ => seq(
      "%",
      alias(token.immediate(/[A-Za-z_][A-Za-z0-9_]*/), $.macro_name),
      ":",
    ),

    macro_name: $ => $.identifier,

    // ── Macro call ────────────────────────────────────────────────────────

    // Standalone statement: %name(args);   %name;   %name content;
    // The third form handles SAS built-ins that take non-parenthesized content:
    //   %put text;   %do i = 1 %to &n;   %if cond %then stmt;   %global x y;
    // Option 3 splits into a required non-paren first token (_mc_tok) followed by
    // optional tokens that may include parenthesized groups (_mc_tok_inner).
    // This ensures option 3 never starts with "(" — eliminating the conflict with
    // option 1's macro_arguments — while still allowing n(&v) and opt=(...) later.
    // prec.right on option 1: prefer consuming the trailing ";" into this rule
    // rather than leaving it as a null_statement.
    macro_call_statement: $ => seq(
      "%",
      field("name", alias(token.immediate(/[A-Za-z_][A-Za-z0-9_]*/), $.macro_name)),
      choice(
        prec.right(seq($.macro_arguments, optional(";"))), // %name(args); or %name(args)
        ";",                                               // %name;
        seq($._mc_tok, repeat($._mc_tok_inner), ";"),      // %name content;
      ),
    ),

    // Inline call used as a value inside other constructs.
    // prec.right: when a "(" follows, prefer attaching it as macro_arguments
    // to this call rather than leaving it for the outer context.
    macro_call: $ => prec.right(seq(
      "%",
      field("name", alias(token.immediate(/[A-Za-z_][A-Za-z0-9_]*/), $.macro_name)),
      optional($.macro_arguments),
    )),

    // prec(1): when "(" immediately follows a macro name, prefer this over
    // _paren_group so %name(args) always uses macro_arguments.
    macro_arguments: $ => prec(1, seq(
      "(",
      optional(seq(
        $._macro_arg,
        repeat(seq(",", $._macro_arg)),
      )),
      ")",
    )),

    _macro_arg: $ => repeat1(choice(
      $.string_literal,
      $.macro_variable_ref,
      $.macro_call,
      $._paren_group,
      /[^,();\s"'&%]+/,
    )),

    // Parenthesized group inside a macro argument — handles non-macro function
    // calls like index(), exist(), scan() that appear as %sysfunc arguments.
    // Commas inside are allowed (they separate the inner function's own args).
    _paren_group: $ => seq(
      "(",
      repeat($._paren_group_item),
      ")",
    ),

    _paren_group_item: $ => choice(
      $.string_literal,
      $.macro_variable_ref,
      $.macro_call,
      $._paren_group,
      /[^();"'&%]+/,
    ),

    // First token of option-3 macro_call_statement content.  Parens excluded so
    // the first token never starts with "(" — keeping option 1 (macro_arguments)
    // unambiguous when "(" follows the macro name.
    _mc_tok: $ => choice(
      $.string_literal,
      $.macro_variable_ref,
      $.macro_call,
      /&=[A-Za-z_][A-Za-z0-9_]*/,  // %put &=var shorthand
      /[^;%()\s"'&]+/,
    ),

    // Subsequent tokens in option-3 content — same as _mc_tok but also allows
    // parenthesized groups for bare SAS calls like n(&panelby) and opt=(...).
    _mc_tok_inner: $ => choice(
      $.string_literal,
      $.macro_variable_ref,
      $.macro_call,
      $._paren_group,
      $._bare_pct,                  // bare % not starting a macro call
      /&=[A-Za-z_][A-Za-z0-9_]*/,  // %put &=var shorthand
      /[^;%()\s"'&]+/,
    ),

    // ── %LET ──────────────────────────────────────────────────────────────

    macro_variable_assignment: $ => seq(
      $._pct_let,
      field("name", $._let_name),
      "=",
      optional(field("value", $._macro_value)),
      ";",
    ),

    // Name in %let: identifier, or identifier+&refs, or pure &ref (e.g. %let name&i or %let &&var)
    _let_name: $ => seq(
      choice($.identifier, $.macro_variable_ref),
      repeat($.macro_variable_ref),
    ),

    _macro_value: $ => repeat1(choice(
      $.string_literal,
      $.macro_variable_ref,
      $.macro_call,
      /[^;]+/,
    )),

    // ── %INCLUDE ──────────────────────────────────────────────────────────

    include_statement: $ => seq(
      $._pct_include,
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
      $.string_literal,
      $.macro_variable_ref,
      /[^;\/\s"'&%]+/,
      /=\s*/,
    ),

    // ── Generic fallback statement ────────────────────────────────────────

    // First token must be non-% to avoid conflict with macro_call_statement.
    // Subsequent tokens may include inline macro_call (e.g. %eval, %if, %sysfunc)
    // so that proc/data statements with embedded macro calls parse cleanly.
    // _bare_pct handles literal % in ODS style attributes (e.g., width=20%).
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
        $.macro_call,
        $._bare_pct,
        /[^;%\/\s"'&]+/,
        /\//,
      )),
      ";",
    ),

    // ── Primitives ────────────────────────────────────────────────────────

    // &var, &&var, &&&var, etc.; optional trailing dot is the macro separator
    macro_variable_ref: $ => token(seq(
      /&+/,
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
