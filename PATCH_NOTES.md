# tree-sitter-sas Patch Notes

Agent-oriented changelog. Each entry describes what SAS constructs became parseable,
what node types changed, and what Ix queries or logic may need updating as a result.

---

## v0.4.2 (2026-05-25)

### Problem solved
19 of 80 `%MACRO` definitions in the AHRQ IQI corpus were not emitting `macro_definition`
nodes. Affected macros generate SAS expressions (not structured statements) as their
bodies — they contain parenthesized expressions, `%DO` loops used as expression
generators, or body content with no terminating `;`.

Three patterns were unrecognized:

**Pattern A — paren-led body, no semicolon:**
```sas
%MACRO MDX1(FMT);
 ((put(DX1,&FMT.) = '1'))
%MEND;
```

**Pattern B — `%DO` inside parens as expression generator:**
```sas
%MACRO MDX(FMT);
 (%DO I = 1 %TO &NDX.-1;
  (put(DX&I.,&FMT.) = '1') or
  %END;
  (put(DX&NDX.,&FMT.) = '1'))
%MEND;
```

**Pattern C — body ending without `;` before `%MEND`:**
```sas
%MACRO MDX2Q2(FMT);
 result = 0;
 if result = 1
%MEND;
```

### Grammar changes

| Rule | Change |
|---|---|
| `_paren_group_item` | Added `macro_do_statement` as an alternative — `%DO...%END` now valid inside paren groups |
| `_macro_body_item` | Added `prec(-1, $_mc_tok_inner)` as last-resort fallback — body content without `;` is consumed token-by-token |
| `generic_statement` (first token) | Regex changed from `/[^;%\/\s"'&]+/` to `/[^();%\/\s"'&]+/` — `(` and `)` excluded from first token so the lexer does not greedily eat paren-group content |
| `conflicts` (new key) | Added `[generic_statement, _mc_tok_inner]` and `[macro_call_statement, macro_call]` — enables GLR disambiguation at those parser states |

### Node types affected
No new node types were added. The existing `macro_definition`, `macro_do_statement`,
`macro_end`, `macro_variable_ref`, `string_literal`, and `numeric_literal` nodes are
now emitted in contexts they were silently skipped before.

### Side effect to be aware of
Inside paren-group body content (Patterns A/B), variable-name tokens like `DX1` are
lexed as `numeric_literal` (`DX` = hex literal, `1` = integer) because the
`numeric_literal` rule has `token(prec(1,...))` and `/[0-9A-Fa-f]+[Xx]/` matches
two-char hex patterns like `DX`. This is cosmetic — those tokens appear as anonymous
children of `macro_definition` in the CST and do not affect query results for
`macro_definition`, `macro_end`, `macro_call`, or `macro_variable_ref`.

### Ix impact
After bumping `core-ingestion` to `^0.4.2`, `macro_definition` entity nodes are emitted
for MDX, MDX1, MDX2, MDX2Q2, MDXAQ2, MDR, MPR in the AHRQ IQI file. The CALLS edges
that were blocked (because no destination entity existed) should now resolve.

---

## v0.4.1 (2026-05-12)

### Problem solved
`%include FILEREF(member)` syntax was silently dropped — the `include_statement` rule
only accepted string literal sources, not fileref notation.

### Grammar changes

| Rule | Change |
|---|---|
| `include_statement` | `source` field changed from `string_literal` only to `choice(string_literal, fileref_source)` |
| `fileref_source` (new) | Single terminal regex `/[A-Za-z_][A-Za-z0-9_]*(\([A-Za-z_][A-Za-z0-9_.]+\))?/` — matches `FILEREF` and `FILEREF(member.sas)` atomically |

### Node types affected
New node: `fileref_source` — child of `include_statement` when source is a fileref.

### Ix impact
`queries.ts` SAS_QUERIES now includes a second `include_statement` pattern:
```scheme
(include_statement source: (fileref_source) @import.source) @import
```
Both string and fileref `%include` forms now produce IMPORTS edges.

---

## v0.4.0 (2026-04-28)

### Grammar changes

| Rule | Change |
|---|---|
| `macro_if_statement` (new) | `%if cond %then body [%else body]` — prec.right for dangling-else disambiguation |
| `macro_do_statement` (new) | `%do [spec]; body %end;` — loop and block forms |
| `numeric_literal` (new) | Integer, float, and SAS hex (`1Ax`) literals with `token(prec(1,...))` priority |
| `externals` | Extended from 5 to 10 tokens: added `PCT_IF`, `PCT_THEN`, `PCT_ELSE`, `PCT_DO`, `PCT_END` |
| `scanner.c` | Branches added for `%if`/`%include` (shared `%i` prefix), `%then`, `%else`/`%end`, `%do` |

### Node types added
`macro_if_statement`, `macro_do_statement`, `numeric_literal`

### Ix impact
Macro control-flow is now structured in the CST. `macro_if_statement` and
`macro_do_statement` nodes appear as named children of `macro_definition` and other
macro body contexts. Numeric values in `%let` assignments now produce `value: (numeric_literal)`
rather than being invisible.

---

## v0.3.9 (2026-03-15)

### Grammar changes
Maintenance release. Corpus test suite hardened; no behavioral grammar changes.

---

## v0.3.8 (2026-03-10)

### Grammar changes
Initial public release with:
- `program`, `data_step`, `proc_step`, `proc_sql_step`
- `macro_definition`, `macro_call`, `macro_call_statement`, `macro_variable_assignment`
- `include_statement` (string literal form only)
- `libname_statement`, `options_statement`
- `set_statement`, `merge_statement`, `update_statement`, `output_statement`
- `sql_select_statement`, `sql_create_statement`, `sql_insert_statement`, `sql_join_clause`
- `string_literal`, `identifier`, `macro_variable_ref`, `macro_name`
- `line_comment`, `block_comment`, `percent_comment`
