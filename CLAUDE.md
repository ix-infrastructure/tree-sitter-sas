# tree-sitter-sas — Claude instructions

## Before every commit to main

Update `PATCH_NOTES.md` with a new entry for the version being released.

Entry format:
```markdown
## vX.Y.Z (YYYY-MM-DD)

### Problem solved
One paragraph — what SAS construct was broken or missing and why it mattered.

### Grammar changes
Table: rule name | what changed

### Node types affected
List new or removed named node types.

### Side effects
Any parse behavior that is technically "correct" but might surprise a consumer.

### Ix impact
What queries, entity types, or edge types in core-ingestion change as a result.
```

Keep entries agent-readable: explain WHAT changed in the parse tree, not HOW the
grammar DSL was edited. Ix agents use this file to understand what nodes are
available at a given version without having to parse grammar.js.

## After publishing a new version

Remind the user to bump `tree-sitter-sas` in `Ix/core-ingestion/package.json`
and to check whether `queries.ts` SAS_QUERIES needs new patterns for any
newly-emitted node types.
