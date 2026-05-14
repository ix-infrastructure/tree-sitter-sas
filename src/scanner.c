#include "tree_sitter/parser.h"
#include <ctype.h>
#include <stdbool.h>

// Must match the order of externals in grammar.js
enum TokenType {
  PCT_LET,
  PCT_MACRO,
  PCT_MEND,
  PCT_INCLUDE,
  BARE_PCT,
};

void *tree_sitter_sas_external_scanner_create(void) { return NULL; }
void tree_sitter_sas_external_scanner_destroy(void *payload) { (void)payload; }
unsigned tree_sitter_sas_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload; (void)buffer; return 0;
}
void tree_sitter_sas_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  (void)payload; (void)buffer; (void)length;
}

static bool is_ident_char(int32_t c) {
  return isalnum((unsigned char)c) || c == '_';
}

static bool advance_if(TSLexer *lexer, char expected) {
  if (tolower((unsigned char)lexer->lookahead) == (unsigned char)expected) {
    lexer->advance(lexer, false);
    return true;
  }
  return false;
}

// Attempt to scan one of the %KEYWORD tokens.
//
// Tree-sitter calls the external scanner BEFORE the internal lexer, which means
// the scanner may be invoked while the lookahead is still at a whitespace
// character (the internal lexer would have consumed it as an "extra").  We
// therefore skip whitespace ourselves (with skip=true so the characters are not
// counted as part of the token), then look for a %KEYWORD with a word boundary.
//
// If we do not find a matching keyword we return false; tree-sitter resets the
// lexer to the pre-scan position and the internal lexer handles the input
// normally.  This means:
//   - %letput  → scanner sees 'l','e','t' then 'p' (ident char) → returns false
//                → internal "%" token + "letput" identifier → macro_call_statement
//   - %let myv → scanner sees 'l','e','t' then ' ' (non-ident) → emits PCT_LET
//                → macro_variable_assignment
bool tree_sitter_sas_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  (void)payload;

  // Skip leading whitespace (space, tab, newline, carriage return).
  // These are consumed with skip=true so they are not part of the token.
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
         lexer->lookahead == '\n' || lexer->lookahead == '\r') {
    lexer->advance(lexer, true);
  }

  if (lexer->lookahead != '%') return false;
  lexer->advance(lexer, false);  // consume '%'

  int32_t c = tolower((unsigned char)lexer->lookahead);

  // Bare % — not followed by an identifier char, so it cannot be a keyword or
  // macro call trigger.  Exclude '*' to let the internal lexer produce the
  // percent_comment token (%* text ;) instead.
  if (valid_symbols[BARE_PCT] && !is_ident_char(c) && c != '*') {
    lexer->result_symbol = BARE_PCT;
    return true;
  }

  // ── %let ──────────────────────────────────────────────────────────────────
  if (c == 'l' && valid_symbols[PCT_LET]) {
    lexer->advance(lexer, false);
    if (advance_if(lexer, 'e') && advance_if(lexer, 't') &&
        !is_ident_char(lexer->lookahead)) {
      lexer->result_symbol = PCT_LET;
      return true;
    }
    return false;
  }

  // ── %macro / %mend ────────────────────────────────────────────────────────
  if (c == 'm') {
    lexer->advance(lexer, false);  // consume 'm'
    int32_t c2 = tolower((unsigned char)lexer->lookahead);

    if (c2 == 'a' && valid_symbols[PCT_MACRO]) {
      lexer->advance(lexer, false);
      if (advance_if(lexer, 'c') && advance_if(lexer, 'r') &&
          advance_if(lexer, 'o') && !is_ident_char(lexer->lookahead)) {
        lexer->result_symbol = PCT_MACRO;
        return true;
      }
      return false;
    }

    if (c2 == 'e' && valid_symbols[PCT_MEND]) {
      lexer->advance(lexer, false);
      if (advance_if(lexer, 'n') && advance_if(lexer, 'd') &&
          !is_ident_char(lexer->lookahead)) {
        lexer->result_symbol = PCT_MEND;
        return true;
      }
      return false;
    }

    return false;
  }

  // ── %include ──────────────────────────────────────────────────────────────
  if (c == 'i' && valid_symbols[PCT_INCLUDE]) {
    lexer->advance(lexer, false);
    if (advance_if(lexer, 'n') && advance_if(lexer, 'c') &&
        advance_if(lexer, 'l') && advance_if(lexer, 'u') &&
        advance_if(lexer, 'd') && advance_if(lexer, 'e') &&
        !is_ident_char(lexer->lookahead)) {
      lexer->result_symbol = PCT_INCLUDE;
      return true;
    }
    return false;
  }

  return false;
}
