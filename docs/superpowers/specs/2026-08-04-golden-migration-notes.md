# Golden corpus migration - classification record

Task 8 of the MathBrain Engine v2 plan: the 175-case corpus of `test-advanced.mjs`
runs against the REAL v2 engine (`services/engine/engine.ts`) as
`tests/engine/test-corpus.mjs`, and every difference from the REAL legacy
compiler (`services/compiler.ts`) is classified below.

Two things are deliberately kept apart:

- **the legacy engine** - `services/compiler.ts`, the code that ships today.
  This is what the diff harness compares against.
- **the drifted copy** - the inline compiler pasted into `test-advanced.mjs`,
  which is NOT the same program (case #156 below is the proof: its assertion
  passes against the copy and fails against the real compiler). Nothing in
  this migration was ever compared against the copy, and `test-advanced.mjs`
  itself is left untouched until Task 12 decides its fate.

Reproduce everything here with:

```
node scripts/engine-diff.mjs      # writes scripts/engine-diff-report.md (gitignored)
node tests/engine/test-corpus.mjs # the permanent gate
```

## Approved improvement classes

1. `\le` / `\ge` / `\neg` symbol-spelling normalization
2. `\cdot` for `*`
3. `\cfrac` nesting for fraction towers
4. `\left...\right` delimiter sizing (and visible parens where legacy used
   invisible `{}` grouping)
5. `\mathrm` for multi-char identifiers
6. Bugs from the spec catalogue that v2 fixes outright (greek in bounds,
   `>=` inside cases, fractions in matrix cells, set-builder symbols,
   `\mathbb` brace escaping, prose/logic flips matching the approved
   disambiguator goldens, `<...=>` eaten by the angle-vector rule, placeholder
   corruption, `\,dx` differential attachment)
7. Spacing-only differences (`\ ` placement); verified per case that no space
   separating a control word from a following letter was dropped
8. `\text{}` grouping differences with the same effective words
9. QED rendering (legacy `\quad \blacksquare`, v2 `\blacksquare`)
10. Scope/header styling that matches the approved document golden (canonical
    casing, spacer heights and placement)
11. NEW-FIX: legacy output is wrong and v2's is right, but the difference is
    not one of classes 1-10. Justified case by case below.

## Changed goldens (13 of 175)

These are the cases whose legacy assertion no longer holds. Each one is now
frozen BYTE-FOR-BYTE against the v2 output in `tests/engine/test-corpus.mjs`
(`latex:` + `class:` + `why:`); the other 162 keep their original
`expected` / `contains` / `notContains` assertion and mode.

| id · input | what changed | class · justification |
|---|---|---|
| **5** · `((a+b))/(c)` | `\frac{(a+b)}{c}` → `\frac{a+b}{c}` | **11** the parens around a fraction operand are grouping, not notation, so v2 dissolves them all the way down; legacy consumed the outer pair and printed the inner one - neither the source's spelling nor a simplification |
| **6** · `x/y/z` | `\frac{x}{y}/z` → `\cfrac{\cfrac{x}{y}}{z}` | **3** fraction tower; legacy built the first `\frac` and left the second slash raw |
| **24** · `x^n^m` | `x^{n}^m` → `x^{n^{m}}` | **6** legacy's output is not valid LaTeX at all - KaTeX rejects it with "Double superscript" |
| **39** · `factorial(2*n)` | `(2*n)!` → `(2\cdot n)!` | **2** `*` renders as `\cdot` |
| **59** · `lim(x -> 0) sin(x)/x` | `\lim_{x \to 0}\ \frac{...}` → `\lim_{x\to 0}\frac{...}` | **7** spacing only: `\to` is a control word that ends at its backslash, so the space before it carries nothing; the space it keeps AFTER it (`\to 0`) is the one that matters |
| **60** · `lim(n -> inf) (1 + 1/n)^n` | `(1\ +\ \frac{1}{n})^n` → `\left(1+\frac{1}{n}\right)^{n}` | **7** + **4** spacing, plus `\left...\right` around the now-tall base and a braced exponent |
| **61** · `lim(h -> 0) (f(x+h) - f(x))/h` | `\lim_{h \to 0}\ \frac{...}` → `\lim_{h\to 0}\frac{...}` | **7** spacing only |
| **62** · `lim_(x -> a) f(x)` | `\lim_{x \to a}\ f(x)` → `\lim_{x\to a} f(x)` | **7** spacing only |
| **84** · `a_ij` | `a_{ij}` → `a_{\mathrm{ij}}` | **5** multi-char identifiers are `\mathrm`; in an index position that reads upright, which is the price of having one uniform rule |
| **98** · `floor((j-1)! + 1)` | `\lfloor (j-1)! + 1 \rfloor` → `\lfloor (j-1)!+1 \rfloor` | **7** spacing only around `+` - and only reachable at all because postfix `!` now parses (fix 4 below); before that this input fell into Raw recovery |
| **155** · `{x : not x in A}` | `\{x \mid \lnot x \in A\}` → `\left\{x\ \middle|\ \neg x\in A\right\}` | **1** `\neg` is `\lnot` under another name (one spelling per symbol), plus **4** `\left...\middle...\right` sizing |
| **156** · `∣x∣` | assertion wanted `\|x\|`, v2 emits `\left\|x\right\|` | **4** delimiter sizing - and BYTE-IDENTICAL to the real legacy compiler. This assertion only ever held against the drifted copy inside `test-advanced.mjs` |
| **158** · `∣Im(f)∣ = 1` | assertion wanted `\|Im(f)\|`, v2 emits `\left\|\mathrm{Im}(f)\right\|=1` | **4** + **5** delimiter sizing and `\mathrm` for the call name. v2 used to shatter this whole statement into Raw spans; fix 2 below repaired it |

## Summary

| | count |
|---|---|
| corpus inputs | 175 |
| byte-identical between the two engines | 54 |
| differing, all classified as improvements | 121 |
| legacy assertions kept unchanged (still hold on v2 output) | 162 |
| goldens re-frozen against v2 output | 13 |
| v2 engine fixes this migration required | 8 |
| corpus inputs whose v2 output fails KaTeX (`throwOnError: true`) | 0 |
| corpus inputs that emit any diagnostic | 0 |

Class breakdown of the 121 corpus diffs (a diff usually carries several
classes - e.g. spacing AND `\cdot`):

| class | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 11 |
|---|---|---|---|---|---|---|---|---|---|
| diffs | 1 | 10 | 2 | 51 | 5 | 29 | 102 | 10 | 5 |

`INITIAL_CONTENT` (the shipped demo document, compiled as ONE document by each
engine and compared line by line): 65 source lines produce output, 14 identical,
51 differing - classes 2 (4), 3 (1), 4 (34), 6 (12), 7 (39), 8 (17), 9 (1),
10 (23), 11 (2). Nothing unclassified. The 23 class-10 diffs are all the same
thing seen twice per scope: legacy emits its `\rule{0pt}{Xem}` spacer on the
blank SOURCE line, v2 emits it as part of the scope header's own output (the
approved document golden in `tests/engine/test-render.mjs`).

The five class-11 (new-fix) corpus diffs, in full:

- **#5** `((a+b))/(c)` - fraction operand parens dissolve completely (above).
- **#42** `factorial(factorial(n))` - legacy printed the literal text
  `factorial(n)!`; v2 prints `(n!)!`. The parens are not optional: `n!!` is
  LaTeX's double factorial, a different function.
- **#73** `sqrt(x/y)` - legacy left `\sqrt{x/y}` (the nested fraction never
  compiled); v2 gives `\sqrt{\frac{x}{y}}`.
- **#104** `sum(n=0 -> inf) x^n/factorial(n) = e^x` - legacy parsed the
  exponent as `x^\frac{n}{n!}`; v2 gives `\frac{x^{n}}{n!}`.
- **#105** `choose(n, k) = factorial(n)/(factorial(k)*factorial(n-k))` - legacy
  never built the fraction (`n!/(k!*(n-k)!)`); v2 gives
  `\frac{n!}{k!\cdot(n-k)!}`.

## v2 engine fixes this migration required

Every one is in an engine stage, with its own test in that stage's suite; none
is a special case in the corpus test.

1. **Glued dot product** (`services/engine/lexer.ts`) - `fdotg` is the
   separator-less spelling of `f dot g` / `f·g`, and rule 1 already rewrites
   `·`. The WORD scanner now splits exactly `letter + "dot" + letter`, carving
   the three spans out of the word's own span so normalized columns (and every
   caret mapped through them) are untouched. Fixed 13 corpus cases (#161-165,
   #168-175), which had been rendering `\text{fdotg}`.
2. **Call form by adjacency** (`services/engine/disambiguate.ts`) - a word
   written tight against `(` opens a call, whatever its vocabulary
   (`Im(f)`, `Aut(G)`, `Var(X)`); a word with a SPACE before the paren is
   still a parenthetical remark, and a STOP_WORD is never a callee. Before
   this, `|Im(f)| = 1` split into three runs and the `|` bars parsed as Raw:
   `\left|\right|\text{Im}(f)\mid\texttt{=}1` with 3 diagnostics. Fixed #158,
   #164, #175 (and #163's rendering).
3. **A `(...)` group never straddles a run boundary**
   (`services/engine/disambiguate.ts`) - a group holding English goes prose
   IN FULL, parens included (a parenthetical remark), unless it also holds
   arithmetic, in which case the odd unknown word joins the math instead.
   Either way the bracket and its partner stay in one run. Before this,
   `x = 5 (by Lemma 3)`, `f(x) = 5 (trivially)` and corpus #143
   `(aRb AND bRc) => aRc` all rendered their parens as `\texttt{}` error spans.
4. **Postfix `!`** (lexer + disambiguator + parser) - `!` is an OP (not the
   PUNCT fallback), attaches like `.` when it sits next to English ("that is
   amazing!"), and parses as the same `factorial` node `factorial(x)` builds.
   Fixed #98, #100, #101, which had been recovering `! +` as Raw.
5. **Factorial of a factorial** (`services/engine/render.ts`) - `(n!)!`, not
   `n!!` (which LaTeX reads as the double factorial). Surfaced by #42.
6. **`cases` stops inventing "otherwise"** (types + parser + renderer) - a
   branch that ends in the word `otherwise` is now recorded as such, and only
   that branch gets the `& \text{otherwise}` column. `cases { x = 0; y = 1 }`
   is a braced system of equations and now renders as one. Surfaced by
   #117-119, #126, #127, #130.
7. **No false "missing operand"** (parser + renderer) - a math run that ENDS
   on an infix operator is complete input when the operand it wants is the
   PROSE that follows (`aRb => bRa`), the mirror image of the leading-operator
   continuation idiom that was already silent. The renderer, which holds the
   run list, passes `proseFollows`. Surfaced by #142, #143; `x +` with nothing
   after it still reports.
8. **A symbol-named word in call position stays the symbol**
   (`services/engine/parser.ts`) - `phi(x)`, `sigma(n)`, `partial(x)^2` are
   that symbol applied to a group, not a function whose name happens to be
   spelled `phi`; they used to render as `\mathrm{phi}(x)`. Words in both
   tables (`sin`, `det`, `sqrt`, ...) are unaffected. Surfaced by #110.

## Notes for later tasks

- `tests/engine/test-corpus.mjs` also holds every case to KaTeX validity
  (`throwOnError: true`) and to zero diagnostics. No input needs the
  `allowDiagnostics` exemption today - the corpus compiles clean.
- KaTeX is not a repo dependency (the app loads it from a CDN), so the suite
  resolves it from `$MATHBRAIN_KATEX_DIR`, then the dev scratchpad, then repo
  `node_modules`, and reports the group as SKIPPED (loudly) if none is found.
- `test-advanced.mjs` is unchanged and still green against its inline copy;
  Task 12 documents what happens to it.
