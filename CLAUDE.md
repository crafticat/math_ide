# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Build for production
npm run preview      # Preview production build locally
npm run test:engine  # Run the engine v2 test suite (11 suites) - the primary test command
node test-advanced.mjs  # 175 legacy compiler test cases (inline copy, predates services/engine/)
node test-editor.mjs    # 40 editor checks (autocomplete, highlighting)
```

## Deployment

When committing changes, always push to trigger GitHub Pages deployment:
```bash
git add -A && git commit -m "message" && git push
```
The site is deployed at: https://crafticat.github.io/math_ide/

## Architecture

MathBrain IDE is a React-based mathematical notation editor that compiles a custom "MathScript" syntax to LaTeX, rendered via KaTeX.

### Core Data Flow

1. User types MathScript in `Editor.tsx`
2. Content change triggers debounced compilation (300ms) in `App.tsx`
3. `services/engine/engine.ts`'s `compile()` transforms MathScript → LaTeX (lexer → document → disambiguate → parser → render)
4. `Preview.tsx` renders LaTeX using KaTeX
5. As the caret moves, `renderLineWithHighlight()` re-renders just the one statement under it with its structural node tinted - no recompile

### Key Files

- **`services/engine/`** - MathBrain Engine v2, the MathScript-to-LaTeX compiler that ships today (App.tsx no longer calls `services/compiler.ts` - see below). A five-stage pipeline, one file per stage: `lexer.ts` (source → tokens) → `document.ts` (tokens → the Scope/Subtask/Claim/Statement block tree) → `disambiguate.ts` (a statement's tokens → prose/math runs) → `parser.ts` (one math run → an `Expr` tree, Pratt/precedence-climbing) → `render.ts` (AST → LaTeX; the only stage that decides output policy - spacing, `\frac` vs `\cfrac`, indentation). `language.ts` holds the shared lookup tables (`FUNCTIONS`, `GREEK`, `SYMBOL_MAP`, `SCOPES`, ...). `engine.ts` is the public API and the only file the rest of the app imports from this directory - `compile(source)` returns LaTeX lines, diagnostics, the AST and a statement index; `nodeAt()` / `renderLineWithHighlight()` resolve a caret to its structural node for highlighting. One exception: `Editor.tsx` imports `language.ts` directly for its syntax-highlighting keyword tables. Full language reference, verified example by example against this engine: `docs/mathscript-spec.md`.

- **`services/compiler.ts`** - The original regex/placeholder MathScript-to-LaTeX compiler (~1600 lines). Superseded by `services/engine/`; kept only as the provenance reference `language.ts`'s tables were ported from and as the legacy side of `scripts/engine-diff.mjs`. Legacy, pending removal - don't build new features on it.

- **`constants.ts`** - Contains `INITIAL_CONTENT` (example document), `THEME` colors, and `AUTOCOMPLETE_DATA` for editor suggestions. Autocomplete templates use `$0` to mark cursor position.

- **`components/Editor.tsx`** - Code editor with syntax highlighting, autocomplete, auto-indentation. Uses `document.execCommand('insertText')` for undo-compatible text insertion. Reports caret `(line, col)` up to `App.tsx` for structure highlighting.

### MathScript syntax

MathScript reads intent from context - prose vs. notation isn't marked, it's inferred (single letters and known symbols are math, ordinary words are text). It covers scopes (`Theorem`/`Proof`/...), dash subtasks, `?:` claims, `#define` macros, fractions, scripts, the standard function/big-operator/relation/logic/set vocabulary, matrices, `cases{}`, and geometry notation. For the full grammar, every symbol table, and the disambiguation rules - each verified against a real `compile()` call - see `docs/mathscript-spec.md`; don't duplicate that content here.

### Structure highlighting

The preview tints the smallest structural node under the editor caret (fractions, powers, calls, big operators, relations, ...), and, on a line stating a pure comparison chain (`= != < > <= >=`), its two sides in alternating colors too. `engine.ts`'s `nodeAt()` / `renderLineWithHighlight()` resolve the caret and wrap the target node(s) in `\htmlClass{hl-node}{...}` (`hl-lhs`/`hl-rhs` for the sides); `Preview.tsx` styles those classes. A fraction's numerator and denominator are separately selectable. Full rules: `docs/mathscript-spec.md`'s "Structure highlighting" section.

### Testing

`npm run test:engine` (`tests/engine/`) is the primary suite: 11 test files covering the lexer, document parser, disambiguator, expression parser, renderer, `engine.ts`'s public API, a 175-case golden corpus, realistic multi-line documents, a fuzz/KaTeX-validity pass, and a compat gate that compiles every `constants.ts` `AUTOCOMPLETE_DATA` template through the real engine (`test-autocomplete-compat.mjs`) - see `docs/superpowers/specs/2026-08-04-golden-migration-notes.md` for how the corpus was migrated off the legacy engine. `test-advanced.mjs` and `test-editor.mjs` (repo root) predate the engine and run against inline/legacy copies rather than `services/engine/`; keep them green, but add new compiler test cases to `tests/engine/` instead.
