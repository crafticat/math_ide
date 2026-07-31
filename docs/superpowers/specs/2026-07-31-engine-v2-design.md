# MathBrain Engine v2 — Design Spec

**Date:** 2026-07-31
**Status:** Approved direction; pending final user review

## Vision context

MathBrain is an IDE for *doing math homework*, not a LaTeX front-end. Three levels:

1. **Type the way you think** — mixed English and math, zero LaTeX knowledge, minimal keystrokes. The app infers intent from context (words near words are prose; single letters near numbers/operators are math).
2. **LaTeX-grade power** through the same lightweight syntax.
3. **The app understands the math** — it knows a line is an equation with sides, enabling future IDE-style manipulation commands (select a term, press a key, it legally moves across the `=`).

This project rebuilds the compilation core so level 1 becomes reliable and level 3 becomes possible. It also ships one visible taste of level 3: **equation-structure highlighting**.

## Problem

`services/compiler.ts` (1,838 lines) is ~30 *ordered* regex/string passes per line with `__PH*__` placeholder protection. Consequences:

- Same logic reimplemented per nesting context (three fraction handlers; Greek letters applied in four places; several subtly-different subscript regexes). Bugs depend on *where* in a formula you write something.
- Pass ordering is load-bearing; every feature multiplies interactions with every pass. The 175 passing tests capture fixed combinations; novel combinations regularly break.
- Text/math disambiguation for `and`/`or`/`not`/`in` is an 11-rule cascade over hardcoded word lists — patched per complaint, not tunable.
- String → string, no structural representation: mapping an editor selection to a math object is impossible, so semantic features are unbuildable on this foundation.
- `Editor.tsx` keeps its own copies of keyword tables for highlighting/autocomplete, which drift from the compiler's.

## Goals

1. Same MathScript surface syntax, plus two escape hatches (the only language change):
   - `"..."` — force prose text.
   - `$...$` — force math.

   `"` and `$` become reserved characters. Accepted break: existing documents containing bare quotes render without the quote glyphs (content becomes forced text — equivalent or better in practice).
2. Output bar: **semantically equivalent or better** than the current engine on all 175 golden cases. Goldens are updated where the new output is an improvement; every golden change gets a one-line justification.
3. **Never hard-fails.** Unparseable spans degrade to text; the preview always renders while typing.
4. **Diagnostics with source spans** from every stage, surfaced in the editor (gutter marker) and console.
5. **Semantic-ready AST:** every node carries source spans; relations are first-class (`Equation` with sides).
6. **One tunable disambiguator** replacing the scattered heuristics, with per-decision explanations.
7. **Single source of truth** (`language.ts`) for keyword/symbol/function tables, consumed by the engine, editor highlighting, autocomplete, and the syntax-help dialog.
8. **Equation-structure highlighting:** the preview highlights the math structure under the editor cursor.

## Non-goals

- Manipulation commands themselves (select + key → transform). This project builds the socket, not the plug.
- New notation coverage beyond the current language.
- Editor internals rewrite (contentEditable/execCommand stays as-is).
- Changing the KaTeX preview stack.

## Architecture

New directory `services/engine/`, old `services/compiler.ts` untouched until the flip.

```
source text
  → lexer.ts        tokens with spans; unicode normalized once
  → document.ts     block tree: scopes, dash subtasks, ?: claims,
                    #define, comments, multi-line cases/matrix
  → disambiguate.ts prose|math classification of ambiguous words
  → parser.ts       recursive-descent/Pratt → typed expression AST
  → render/latex.ts AST → LaTeX; ALL spacing/styling policy here
  → engine.ts       public API; diagnostics aggregated from all stages
```

### `language.ts` — single source of truth

Exports the tables today duplicated between compiler and editor: math keywords, symbol map, Greek letters, function signatures (name, arity, template), scope names, stop-word lexicon (word classes: articles, auxiliary verbs, prepositions, proof verbs, math adjectives). The engine, `Editor.tsx` autocomplete/highlighting, and the syntax-help dialog all read from here.

### `lexer.ts`

Tokens `{kind, text, start, end, line}`. Kinds: WORD, NUMBER, OP, PUNCT, LPAREN/RPAREN, LBRACKET/RBRACKET, LBRACE/RBRACE, STRING (`"..."`), MATH_QUOTE (`$...$`), COMMENT. Multi-char operators (`->`, `=>`, `<=>`, `!=`, `<=`, `>=`, `+-`, `-+`) are single tokens. Unicode normalization (`∣│∥` → `|`, `·•∙` → cdot-operator, etc.) happens here, once. Unterminated `"` or `$` emits a diagnostic and falls back to literal characters.

### `document.ts`

Line-oriented block parser producing the document tree:

`Document → Block[]` where `Block = Scope{type, title, styling, children} | Subtask{depth, title, children} | Claim{statement, children} | Statement{tokens} | MacroDef | Comment`.

Replaces regex pre-joining of multi-line `cases {}` / `matrix()` (tracked by brace/paren depth), the `indentLevel` counter, and the subtask numbering counters — numbering and indentation derive from tree position at render time. `#define` macros apply at the token level (WORD-boundary safe by construction).

### `disambiguate.ts`

Input: a statement's token stream. Output: each WORD token tagged `prose | math`, plus an explanation string per decision.

Mechanism: a **feature-scoring function with one tunable weight table**, not a rule cascade. Features include:

- Absolute overrides: inside STRING → prose; inside MATH_QUOTE, set-builder, function arguments, subscripts, cases, matrices → math; known math keyword/symbol → math.
- Strong priors: single alphabetic char → math; multi-char word in stop-word lexicon → prose; multi-char unknown word → prose.
- Context features (the vision, made literal): classes of nearest non-punctuation neighbors on each side (prose-word / single-letter / number / operator), comma immediately before (`, and` → prose), quantifier or logic operator present in the statement, capitalized-single-letter neighbor patterns (`in A` → membership).
- Ambiguous words (`and`, `or`, `not`, `in`, article `a`) are just words with weights — no special-cased code paths.

Ties resolve to the current engine's defaults (single-char → math, multi-char → prose). Decisions with explanations are exposed for a debug view ("why did this render as text?").

### `parser.ts`

Recursive-descent + Pratt expression parser over each statement's math runs. Node inventory:

`Num, Var, SymbolNode, TextNode, BinOp, UnaryOp, Frac, Pow, Subscript, Call{fn, args}` (trig/log/sqrt/floor/ceil/choose/factorial/accents/overline/ray/arc/det/…), `BigOp{kind: sum|integral|lim, bounds}`, `SetLiteral, SetBuilder{element, condition}, Abs, AngleVector, Interval, Matrix{env, rows}, Cases{branches}, Relation{ops, operands}` (n-ary chain: `a = b < c`), `Raw{tokens}` (recovery).

- **Every node carries a source span** `{line, start, end}`.
- **A Statement is a sequence of prose and math segments;** a statement whose top-level math is a `Relation` containing `=` is an **Equation** — sides are directly addressable. This is the socket for future manipulation commands.
- Nesting is natural: `sqrt((a+b)/(c+d))^2` parses with zero special cases. **No placeholders, no pass ordering.**
- **Error recovery:** on failure inside a math run, wrap the failed span as `Raw` (renders as plain text), emit a diagnostic, resync at statement/bracket boundaries. The parser never throws.

### `render/latex.ts`

AST → LaTeX. The *only* place with output policy: `\text{}` grouping of adjacent prose, spacing (`\ `), indentation (`\quad` per tree depth), scope header sizing (`\huge`/`\Large`/`\large`) and bold/italic styling, subtask labels (`(i)`/`(a)`), spacer rules between blocks. Output shape stays `{id, latex, originalLine}[]` for `Preview.tsx`.

Renderer accepts an optional **highlight request** (see below) and wraps the target subtree accordingly.

### `diagnostics.ts`

`Diagnostic {span, severity: info|warn, message, hint?}`. Aggregated by `engine.ts`; mapped into the existing `LogEntry` console channel; editor shows a gutter marker on affected lines (inline squiggles are a nice-to-have, not required — contentEditable + execCommand undo makes inline decoration fiddly).

### `engine.ts` — public API

```ts
compile(source: string): {
  latexLines: {id, latex, originalLine}[],   // superset-compatible with today
  macros: Record<string, string>,
  logs: LogEntry[],                          // mapped diagnostics
  diagnostics: Diagnostic[],
  ast: Document,
  nodeAt(line: number, column: number): NodeHandle | null,
}
```

`types.ts` extends `CompilationResult` accordingly. `App.tsx` keeps the 300 ms debounce compile; the highlight path (below) does not recompile.

## Equation-structure highlighting (the visible fruit)

**Behavior:**

- When the editor caret sits inside a math segment, the preview highlights the rendered output of the **innermost structural node** containing the caret. Structural kinds: `Frac` (and its num/den parts), `Pow`, `Subscript`, `Call`, `BigOp`, `SetBuilder`, `Abs`, `Matrix` cell, `Cases` branch, `Relation` side. Bare `Var`/`Num` alone don't highlight.
- If the caret's statement is an **Equation**, its sides get two subtle distinct tints while the caret is on that line — the app visibly *knows* left from right. For relation chains (`a = b < c`), each operand region gets alternating tints.
- No highlight when the caret is in prose or on a `Raw` (unparsed) span.
- Styling is a subtle background tint that must not shift layout.

**Mechanism:** caret `{line, column}` → `nodeAt()` via spans → re-render *only that line's* AST with the highlight request → replace that line in the preview. Render-only, ~instant, ~50 ms debounce on caret move. Preferred wrapping: KaTeX `\htmlClass` (requires `trust` for that command only) + CSS backgrounds; fallback if trust/strict conflicts: `\colorbox`-style subtree wrap. Final choice at implementation time; behavior above is the contract.

## Migration & integration

1. Build `services/engine/` alongside the untouched old compiler.
2. **Dual-engine diff harness** (dev script): run both engines over the golden corpus + `INITIAL_CONTENT` + real saved documents (exported from the app's autosave); report diffs. Every diff is classified *improvement* (golden updated, justified) or *regression* (fixed).
3. Flip `App.tsx` to `engine.ts` when the corpus is green; editor tables switch to `language.ts` in the same change.
4. Old `compiler.ts` and the diff harness are deleted after one stable release.

## Testing

- **Golden corpus:** the 175 cases ported as engine goldens (equivalent-or-better review process above).
- **Disambiguator:** table-driven cases — all current `and/or/not/in` scenarios from the old rules' comments become rows, plus escape-hatch cases.
- **Parser:** AST snapshot tests for representative constructs; error-recovery tests on truncated/half-typed input.
- **Property/fuzz:** random token soup and random prefixes of corpus inputs → the engine never throws and yields output for every non-empty line.
- **KaTeX validation in CI:** golden outputs must pass `katex.renderToString` with `throwOnError: true` — invalid LaTeX can't ship.
- **Highlighting:** unit tests for `nodeAt` span lookup; integration cases (caret in denominator → `Frac.den`; caret on `=` line → sides).
- **Editor suite:** the 37 existing tests keep passing after the `language.ts` switch.

## Milestone sketch (final ordering in the implementation plan)

1. `language.ts` extraction + lexer (incl. escape hatches)
2. Document parser
3. Expression parser + AST
4. Disambiguator
5. Renderer + golden-corpus migration + diff harness
6. `engine.ts` API, `App.tsx` flip, diagnostics UI (gutter + console)
7. Structure highlighting
8. Stabilize; delete old compiler + harness

## Risks

- **Disambiguation regressions on real documents** → diff harness + corpus + escape hatches as user recourse; weights in one table make fixes one-line changes.
- **KaTeX trust/strict conflicts for `\htmlClass`** → specified fallback (`\colorbox` subtree wrap).
- **Inline squiggles vs contentEditable/undo** → scope guard: gutter markers + console are the requirement; squiggles optional.
- **Scope creep toward manipulation features** → explicit non-goal; only the AST socket ships.

## Success criteria

- All migrated goldens pass; every golden change carries an improvement justification.
- Dual-engine diff on `INITIAL_CONTENT` + samples shows only approved improvements.
- Fuzz/property suite: zero throws.
- All 37 editor tests green after `language.ts` unification.
- Caret in any math span highlights the correct subtree; equation lines show sides distinctly.
- `compiler.ts` deleted; exactly one engine remains.
