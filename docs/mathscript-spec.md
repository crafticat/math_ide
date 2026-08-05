# MathScript Language Reference

MathScript is the plain-text notation MathBrain IDE compiles to LaTeX (rendered live via KaTeX). This document describes the **language** — what you can type and what it produces — verified example by example against the real compiler (`services/engine/`, MathBrain Engine v2). For how the compiler itself is built (the lexer → document → disambiguate → parse → render pipeline), see `CLAUDE.md`.

Every example below is the actual output of `compile()` on the given source, not a hand-written guess.

## Contents

- [Overview](#overview)
- [Document structure](#document-structure)
  - [Scopes](#scopes)
  - [Dash subtasks](#dash-subtasks)
  - [Claims (`?:`)](#claims-)
  - [Macros (`#define`)](#macros-define)
  - [Comments](#comments)
- [Expressions](#expressions)
  - [Precedence, at a glance](#precedence-at-a-glance)
  - [Fractions](#fractions)
  - [Scripts (subscript / superscript)](#scripts-subscript--superscript)
  - [Functions](#functions)
  - [Big operators](#big-operators-sum-integral-lim)
  - [Relations and chains](#relations-and-chains)
  - [Logic](#logic)
  - [Sets](#sets)
  - [Matrices and cases](#matrices-and-cases)
  - [Absolute value and divides](#absolute-value-and-divides-)
  - [Vectors](#vectors-a-b-c)
  - [Primes](#primes-)
  - [Ellipsis](#ellipsis-)
  - [Factorial](#factorial-)
- [Symbol tables](#symbol-tables)
- [Text vs. math: how MathScript reads your intent](#text-vs-math-how-mathscript-reads-your-intent)
- [Diagnostics](#diagnostics)
- [Structure highlighting](#structure-highlighting)
- [Known limitations](#known-limitations)

## Overview

MathBrain is built for writing math the way you'd write it on paper — mixed English and notation, with zero LaTeX knowledge required. You don't mark which parts of a line are prose and which are math; MathScript reads it from context, the same way a human reader would: single letters and known notation are math, ordinary words are English. The full rule set is in [Text vs. math](#text-vs-math-how-mathscript-reads-your-intent) below, but the short version is: **write naturally**.

Two characters are reserved as explicit escape hatches, for the moments the automatic reading isn't what you meant:

- `"..."` forces its contents to be literal text, whatever's inside — no MathScript syntax is interpreted, not even symbols like `|`.
- `$...$` forces its contents to be parsed as a self-contained math expression, even in the middle of an English sentence.

(A third, smaller notation addition beyond these two escape hatches: exactly three dots, `...`, lex as one token too — not an escape hatch, just a symbol, `\ldots` — see [Ellipsis](#ellipsis-) below.)

```
Let $speed$ = 5 dot t and note the speed is constant
```
→ `\text{Let }\mathrm{speed}=5\cdot t\ \text{and note the speed is constant}`

```
We write "a | b" when a divides b
```
→ `\text{We write a | b when }a\text{ divides }b`

Because of this, `"` and `$` can't be used for anything else — an old document that happens to contain a bare quote renders it as the start of a forced-text span instead of a literal quotation mark:

```
the rod is 5" long
```
→ `\text{the rod is }5\text{ long}`, plus `unterminated quote — treated as text` — the `"` itself doesn't survive (it opened a text span, not a literal character), and everything after it to the end of the line is swallowed into that span.

### A worked example

```
Theorem {
  forall n in Math.naturals: sum(i=1 -> n) i = n*(n+1)/2
}
Proof {
  - base case {
    ?: n = 1 {
      sum(i=1 -> 1) i = 1 = 1*(1+1)/2
    }
  }
  - inductive step {
    Assume sum(i=1 -> n) i = n*(n+1)/2
    Then sum(i=1 -> n+1) i = n*(n+1)/2 + (n+1) = (n+1)*(n+2)/2
    QED
  }
}
```

Each source line compiles to one rendered line (headers and labels get their own LaTeX too — full details in [Document structure](#document-structure)):

| source | LaTeX |
|---|---|
| `Theorem {` | `{\huge \textbf{\text{Theorem.}}}` |
| `forall n in Math.naturals: sum(i=1 -> n) i = n*(n+1)/2` | `\quad \forall n\in\mathbb{N}:\ \sum_{i=1}^{n} i=\frac{n\cdot(n+1)}{2}` |
| `Proof {` | `{\huge \textit{\text{Proof.}}}` |
| `- base case {` | `\quad \textbf{\text{(i) base case:}}` |
| `?: n = 1 {` | `\quad \quad \textit{\text{Claim: }}n=1` |
| `sum(i=1 -> 1) i = 1 = 1*(1+1)/2` | `\quad \quad \quad \sum_{i=1}^{1} i=1=\frac{1\cdot(1+1)}{2}` |
| `- inductive step {` | `\quad \textbf{\text{(ii) inductive step:}}` |
| `Assume sum(i=1 -> n) i = n*(n+1)/2` | `\quad \quad \text{Assume }\sum_{i=1}^{n} i=\frac{n\cdot(n+1)}{2}` |
| `Then sum(i=1 -> n+1) i = ...` | `\quad \quad \text{Then }\sum_{i=1}^{n+1} i=\frac{n\cdot(n+1)}{2}+(n+1)=\frac{(n+1)\cdot(n+2)}{2}` |
| `QED` | `\quad \quad \blacksquare` |

Zero diagnostics. This document works through every feature that example touches, and everything else the language supports.

## Document structure

MathScript documents are line-oriented: a line either opens a block (a scope, a subtask, a claim), closes one (a lone `}`), defines a macro, is a comment, or is a statement. Blocks nest by containing more lines before their closing `}`.

### Scopes

A scope is `Keyword optional title words {`, some content, then a line that is exactly `}`. There are 14 scope keywords; 10 render as a **bold** header, 4 as *italic*:

| Bold | Italic |
|---|---|
| `Problem` | `Proof` |
| `Subproblem` | `Claim` |
| `Section` | `Remark` |
| `Part` | `Example` |
| `Theorem` | |
| `Case` | |
| `Lemma` | |
| `Definition` | |
| `Corollary` | |
| `Proposition` | |

```
Theorem Bernoulli inequality {
  x = 1
}
```
→
```
{\huge \textbf{\text{Theorem Bernoulli inequality}}}
\quad x=1
```
(top-level, hence `\huge`; nesting shrinks the size — see below)

A few precise rules worth knowing:

- **The `{` must be the last token on its own line.** `Theorem foo {` on a line by itself opens a scope. `Theorem foo { x = 1 }` all on one line does **not** — there's no scope-closing `}` line, so it's read as an ordinary statement instead (and renders as prose: `\text{Theorem foo }\{x=1\}`). Always put the opening `{` at the end of the header line and the body on the lines after it.
- **The keyword is matched case-insensitively**, but the rendered header always uses the canonical spelling regardless of how you typed it: `theorem foo {` still renders `\textbf{\text{Theorem foo}}`, and `PROOF {` still renders `\textit{\text{Proof.}}`.
- **No title** renders just the type name with a period: `Proof {` (empty title) → `{\huge \textit{\text{Proof.}}}`.
- **A title that's just words** renders as one text run: `Problem 3 {` → `{\huge \textbf{\text{Problem 3}}}`.
- **A title carrying real notation** — a bracket, a quoted run, or an operator that isn't sentence punctuation (`. , ; !`) — gets its math segments typeset in `$...$` inside the bold/italic wrapper instead of being escaped as text:
  ```
  - Apply the test to a_n = x^n/factorial(n) {
  ```
  → `\textbf{\text{(i) Apply the test to }$a_{n}=\frac{x^{n}}{n!}$\text{:}}`
  (this example is a subtask label, not a scope, but the same title logic applies to both — see [Dash subtasks](#dash-subtasks))
- **Sentence punctuation in a title stays literal text**, it doesn't trigger the notation path: `Theorem Bernoulli's inequality. {` → `{\huge \textbf{\text{Theorem Bernoulli's inequality.}}}`.
- **Nesting** shrinks the header size and adds breathing room above it. Sizes: `\huge` (depth 0) → `\Large` (1) → `\large` (2) → `\normalsize` (3+, clamped). Spacer heights before each header: `1.5em` → `1em` → `0.5em` → `0.2em` (clamped the same way; the very first line of the whole document gets no spacer). A small `0.3em` spacer follows every scope's close.
- **Unclosed** (no `}` before end of file): everything collected so far still renders, plus an info diagnostic (`unclosed scope: Theorem`).

**Naming collision worth knowing:** `Claim` is both one of the 14 scope names above (renders like `Proof`/`Remark` — an italic header) *and* the keyword that opens the completely unrelated `?:` construct below. They nest independently:

```
Claim uniqueness {
  ?: x = 1 {
    y = 2
  }
}
```
→
```
{\huge \textit{\text{Claim uniqueness}}}
\quad \textit{\text{Claim: }}x=1
\quad \quad y=2
```

### Dash subtasks

One to four leading `-` characters, then optional title words, then `{` — nested proof structure, styled like a markdown list:

```
Proof {
  - base case {
    x = 1
  }
  - inductive step {
    y = 2
  }
}
```
→
```
{\huge \textit{\text{Proof.}}}
\quad \textbf{\text{(i) base case:}}
\quad \quad x=1
\quad \textbf{\text{(ii) inductive step:}}
\quad \quad y=2
```

- **Depth 1** (`-`) numbers with roman numerals: `(i) (ii) (iii) ...`. **Depth 2 and deeper** (`--`, `---`, `----`) number with letters: `(a) (b) (c) ...`. The depth only chooses which numeral STYLE a level uses, not how the label looks at that depth — a lone `---` (depth 3) subtask still renders `(a)`, not `(aa)` or anything reflecting the `3`:
  ```
  - a {
    -- b {
      --- c {
        ---- d {
          x = 1
        }
      }
    }
  }
  ```
  → `\textbf{\text{(i) a:}}` / `\quad \textbf{\text{(a) b:}}` / `\quad \quad \textbf{\text{(a) c:}}` / `\quad \quad \quad \textbf{\text{(a) d:}}`
- **Counters are sibling-scoped**: they count subtasks of the *same depth* among one block's immediate children, and reset the moment you leave that parent. Two separate `Proof { - first { ... } }` scopes each start their own depth-1 count back at `(i)`.
- **No title** renders just the label, with no trailing colon: `- {` → `\textbf{\text{(i)}}` (compare `- base case {` → `\textbf{\text{(i) base case:}}`, which does get the colon).
- **More than 4 dashes**, or a line whose dashes don't end in `{`, isn't list syntax — it falls through to an ordinary statement.
- Indentation is one `\quad` per tree depth, same as everything else in the document.

### Claims (`?:`)

`?: statement {` states what needs to be proved: the statement renders inline with an italic **"Claim: "** label, and its body (the proof of that claim) is indented one level deeper.

```
?: (1+x)^0 >= 1 {
  (1+x)^0 = 1
}
```
→
```
\textit{\text{Claim: }}(1+x)^{0}\ge 1
\quad (1+x)^{0}=1
```

It nests anywhere a statement can appear — inside a subtask, inside a scope, at the top level. Left unclosed, it still renders with an info diagnostic (`unclosed claim`). See the [Scopes](#scopes) section above for how this differs from the `Claim` *scope* keyword, which is a different construct that happens to share the word "Claim".

### Macros (`#define`)

```
#define N Math.naturals
forall n in N
```
→ `\forall n\in\mathbb{N}` (with `macros = { N: 'Math.naturals' }` recorded alongside the compiled output)

`#define NAME token token token...` on its own line registers `NAME`; the line itself renders nothing. Every later occurrence of `NAME` as a whole word is replaced by the macro's tokens — the replacement can be more than one token:

```
#define EPS eps > 0
forall EPS
```
→ `\forall\varepsilon>0`

- **Expansion is token-level, single-pass**: the replacement is substituted exactly once. If a macro's own replacement happens to contain another macro's name, that name is emitted as-is, not recursively expanded.
- **An empty replacement is refused**, not silently registered: `#define N` with nothing after the name produces a warning (`#define N has no replacement — ignored`) and leaves `N` unregistered, so later `N` tokens pass through literally instead of vanishing.
- Macros only apply to text **after** the `#define` line — the document is processed top to bottom.

### Comments

`// ...` runs to the end of the line, anywhere a line can appear. A comment-only line renders nothing:

```
x = 1 // this is a comment
// a whole line of nothing but a comment
y = 2
```
→ two rendered lines, `x=1` and `y=2` — the comment lines contribute no output.

There's no block-comment syntax.

## Expressions

Everything below happens inside a single math run — the notation between (or instead of) prose on a statement line. See [Text vs. math](#text-vs-math-how-mathscript-reads-your-intent) for how MathScript decides where a math run starts and stops within a line of mixed English and notation.

### Precedence, at a glance

Binding powers, higher binds tighter (from the parser's own precedence table):

| level | constructs |
|---|---|
| 3 | loose adjacency: quantifier clauses; `:` `,` `;` `.` as connectors between clauses |
| 4 | `iff` / `<=>` |
| 5 | `implies` / `=>` |
| 6 | `or` / `OR` |
| 7 | `and` / `AND` |
| 8 | `not` / `NOT` (prefix) |
| 10 | the relation chain: `= != < > <= >=`, plus the word-relations `in notin subset congruent similar parallel perp corresponds` — collected into one n-ary chain |
| 12 | `->`, `+-`, `-+`, `union`, `intersect`, and `\|`  read as "divides" when it has no partner bar |
| 20 | `+` and binary `-` |
| 25 | `/` (fraction) |
| 30 | juxtaposition (implicit multiplication), `*`, `dot` |
| 40 | unary minus |
| 50 | postfix `'` (prime) and postfix `!` (factorial) |
| 60 | `^` and `_`, right-associative |

The one rule worth internalizing on its own, because it's easy to get backwards: **juxtaposition (level 30) binds tighter than `/` (level 25)**. See [Fractions](#fractions) just below for what that buys you.

### Fractions

`a/b` → `\frac{a}{b}`. Parenthesized operands work the same way: `(a+b)/(c+d)` → `\frac{a+b}{c+d}`.

**Juxtaposition binds tighter than `/`** — this is the rule that makes the Laplacian read correctly:

```
partial^2 u/partial x^2 + partial^2 u/partial y^2 = 0
```
→ `\frac{\partial^{2}u}{\partial x^{2}}+\frac{\partial^{2}u}{\partial y^{2}}=0`

`partial^2 u` and `partial x^2` are each collected as ONE factor (implicit multiplication) *before* `/` ever gets a chance to split the line, so the whole numerator sits over the whole denominator — exactly the ∂²u/∂x² convention.

A fraction nested inside another fraction switches the **whole tower** to `\cfrac`, so nested numerators and denominators don't shrink twice over:

```
x/y/z
```
→ `\cfrac{\cfrac{x}{y}}{z}`

```
1/(1 + 1/n)
```
→ `\cfrac{1}{1+\cfrac{1}{n}}`

Parentheses that are only a fraction operand's own delimiters are dropped in the output, however many layers deep — the fraction bar is its own grouping, so they're visual noise:

```
((a+b))/(c)
```
→ `\frac{a+b}{c}` (not `\frac{(a+b)}{(c)}`, not even `\frac{(a+b)}{c}`)

The differentials `dx dy dz dt du dv` always end the product they're part of. That's what makes Leibniz notation come out right:

```
d/dx f(x)
```
→ `\frac{d}{dx}f(x)` — the `dx` closes off the denominator, so `f(x)` multiplies onto the *whole fraction* rather than being swallowed into it.

```
dy/dx
```
→ `\frac{dy}{dx}` — with nothing after it to multiply onto, a differential fraction is just a fraction.

(`partial` is deliberately **not** in that differential-closing set — it's an ordinary factor, which is exactly what let `partial x^2` above keep collecting into one denominator instead of splitting at `partial`.)

A big operator (`sum`, `integral`, `lim`) heading a numerator scopes over the **whole** fraction, not just its own leading term:

```
sum(i=1 -> n) 1/i
```
→ `\sum_{i=1}^{n}\frac{1}{i}` (the sum of 1/i, not (the sum of 1) over i)

### Scripts (subscript / superscript)

`_` for a subscript, `^` for a superscript. Both are right-associative and chain with their *own* operator: `x^y^z` → `x^{y^{z}}`.

The two operators interrupt each other, so a script argument stops at the *other* operator instead of swallowing it — the sibling script ends up applying to the whole thing built so far:

```
a_i^2
```
→ `a_{i}^{2}` — read as `(a_i)^2`, not `a` to the power of `i^2`.

```
x^a_b
```
→ `x^{a}_{b}` — read as `(x^a)_b`.

Parenthesized arguments — `x^(...)` / `a_(...)` — parse the parenthesized content as a completely fresh expression:

```
x^(1/n)
```
→ `x^{\frac{1}{n}}`

```
a_(n+1)
```
→ `a_{n+1}`

A longer alternating chain automatically adds the extra braces LaTeX needs to stay valid (KaTeX rejects two superscripts glued directly onto one atom) — you don't need to add these by hand:

```
x^a_b^a_b
```
→ `{x^{a}_{b}}^{a}_{b}`

The superscript-limit convention — a bare sign as the whole exponent, as in `x -> 0^+` — renders the sign alone as the script; a sign *with* an operand after it is the ordinary unary minus instead:

```
x -> 0^+
```
→ `x\to 0^{+}`

```
x^-1
```
→ `x^{-1}` (unary minus applied to `1`, not a bare `-` script)

**Typography inside a script:** an unrecognized all-lowercase multi-letter name renders as plain juxtaposed italic letters — read as a run of single-letter indices, matching matrix-entry notation like `a_{ij}` — instead of the upright `\mathrm{...}` a multi-letter name gets everywhere else in the language:

```
x_(ij)
```
→ `x_{ij}`

A capital anywhere in the name means it's a *label*, not an index pair, and keeps the upright spelling:

```
P_AB
```
→ `P_{\mathrm{AB}}`

...and a name that's already a recognized keyword keeps its own spelling regardless:

```
a_max
```
→ `a_{\max}`

### Functions

MathScript's function table (`FUNCTIONS` in `language.ts`) has five kinds. Every one of them is matched by its **exact, case-sensitive, lowercase spelling** — `Sin(x)`, `SQRT(x)`, `Cases {` are not recognized (only scope keywords like `Theorem`/`Proof` are matched case-insensitively; see [Scopes](#scopes)).

**Named, variadic** — usable in call form `fn(args)` *or* bare, with no parentheses at all, the way working mathematicians actually write them:

`sin cos tan sec csc cot arcsin arccos arctan sinh cosh tanh log ln exp det max min gcd lcm`

```
sin(x)
```
→ `\sin(x)`

```
sin x
```
→ `\sin x` — same glyph, no parentheses.

```
det A
```
→ `\det A`

```
gcd(a, b) = lcm(a, b)
```
→ `\gcd(a, b)=\operatorname{lcm}(a, b)` — `gcd` has a native KaTeX macro; `lcm` doesn't, so it's spelled with `\operatorname{}` instead. Same upright look either way, but this is the one that actually renders.

**Accents, one argument** — `hat bar tilde vec` wrap an ordinary operand:

```
hat(x) + bar(y) + tilde(z) + vec(v)
```
→ `\hat{x}+\bar{y}+\tilde{z}+\vec{v}`

...while the *geometry* accents (`overline ray arc`) treat a multi-letter argument as a **point label**, printed literally instead of upright-`\mathrm`'d:

```
overline(AB) = ray(CD)
```
→ `\overline{AB}=\overrightarrow{CD}`

```
arc(AB)
```
→ `\overset{\frown}{AB}`

**Delimiters, one argument** — `floor ceil sqrt abs`. Note the spacing asymmetry: floor/ceil keep a visible space against the bracket, sqrt and abs don't:

```
floor(x) + ceil(x) + sqrt(x) + abs(x)
```
→ `\lfloor x \rfloor+\lceil x \rceil+\sqrt{x}+\left|x\right|`

**Big operators** (`sum integral lim`) and **matrix-likes** (`matrix bmatrix vmatrix cases`) have their own bound/body syntax — see [Big operators](#big-operators-sum-integral-lim) and [Matrices and cases](#matrices-and-cases).

**Named, fixed arity** — `choose(n, k)` and `factorial(n)` are notation, not operator glyphs, so they have no bare form:

```
choose(n, k)
```
→ `\binom{n}{k}`

`factorial` is covered under [Factorial](#factorial-) below, alongside its postfix `!` spelling.

**Unknown callees** — any word immediately followed by `(` that isn't in the table above is still a call: a single letter stays italic, a multi-character name goes upright:

```
f(x) = g(x) + 1
```
→ `f(x)=g(x)+1`

```
speed(t) = 5
```
→ `\mathrm{speed}(t)=5`

For a multi-character name, the `(` has to sit **tight against the name with no space** to be read as a call at all:

```
Im(f) = Aut(G)
```
→ `\mathrm{Im}(f)=\mathrm{Aut}(G)`

A name followed by a *space* and then a parenthetical is read as an English aside instead, not a function application — see [Text vs. math](#text-vs-math-how-mathscript-reads-your-intent). (Table function names like `sin`/`sqrt` stay lenient about the space either way — `sin (x)` is still a call.)

### Big operators (`sum`, `integral`, `lim`)

Two equivalent bound spellings compile to byte-identical output — the MathScript-native arrow form, and the LaTeX-flavored script form for anyone who thinks in `\sum_{}^{}` already:

```
sum(i=1 -> n) i^2
```
→ `\sum_{i=1}^{n} i^{2}`

```
sum_(i=1)^(n) i^2
```
→ `\sum_{i=1}^{n} i^{2}` — identical.

```
integral(a -> b) f(x) dx
```
→ `\int_{a}^{b} f(x)\,dx` — a trailing differential attaches with LaTeX's own thin space.

`lim` collapses its bound to **one subscript with an arrow inside it**, not two separate scripts:

```
lim(x -> 0) sin(x)/x
```
→ `\lim_{x\to 0}\frac{\sin(x)}{x}`

```
lim_(h -> 0) f(x)
```
→ `\lim_{h\to 0} f(x)`

A tall body (one containing its own fraction, another big operator, etc.) automatically grows parentheses around it:

```
lim(n -> inf) (1 + 1/n)^n = Math.e
```
→ `\lim_{n\to\infty}\left(1+\frac{1}{n}\right)^{n}=e`

Used bare, with no bounds at all, a big operator just prints its glyph (`\sum`, `\int`, `\lim`).

### Relations and chains

| MathScript | LaTeX | | MathScript | LaTeX |
|---|---|---|---|---|
| `=` | `=` | | `notin` | `\notin` |
| `!=` | `\neq` | | `subset` | `\subset` |
| `<` | `<` | | `congruent` | `\cong` |
| `>` | `>` | | `similar` | `\sim` |
| `<=` | `\le` | | `parallel` | `\parallel` |
| `>=` | `\ge` | | `perp` | `\perp` |
| `in` | `\in` | | `corresponds` | `\triangleq` |
| `implies` / `=>` | `\implies` | | `iff` / `<=>` | `\iff` |

A run of relations at the same tier collapses into **one** chain rather than nesting comparisons:

```
a = b < c
```
→ `a=b<c` — one 3-operand relation, not `a=b` conjoined with `b<c`.

```
0 <= |a_n - L| < eps/2 < eps
```
→ `0\le\left|a_{n}-L\right|<\frac{\varepsilon}{2}<\varepsilon` — one 4-operand chain.

Only a chain built **entirely** from `= != < > <= >=` counts as an equation with two sides a reader could move a term across — `a = b in C` mixes an equation operator with membership and isn't treated as one. This distinction only matters for [structure highlighting](#structure-highlighting): it's what decides whether a line's two sides get tinted.

### Logic

Uppercase `AND OR NOT` are always the logic symbols, unconditionally:

```
p AND q OR NOT r
```
→ `p\land q\lor\neg r`

Lowercase `and`/`or`/`not` read as *either* English or ∧/∨/¬, depending on the sentence around them — see [Text vs. math](#text-vs-math-how-mathscript-reads-your-intent) for the full rule. Two contrasting real examples:

```
Let a and b be real numbers suchthat a^2 + b^2 = 1
```
→ `\text{Let }a\text{ and }b\text{ be real numbers s.t. }a^{2}+b^{2}=1` — `and` reads as English.

```
x in A and y in B => x + y in A union B
```
→ `x\in A\land y\in B\implies x+y\in A\cup B` — `and` reads as ∧, because nothing around it is English.

`forall`, `exists`, `suchthat` are always math, and each grabs the clause that follows it as its scope:

```
forall eps > 0 exists delta > 0 suchthat |x - y| < delta => |f(x) - f(y)| < eps
```
→ `\forall\varepsilon>0\ \exists\delta>0\ \text{ s.t. }\left|x-y\right|<\delta\implies\left|f(x)-f(y)\right|<\varepsilon`

### Sets

`{1, 2, 3}` is a literal; `{}` is the empty set:

```
A = {1, 2, 3}
```
→ `A=\{1, 2, 3\}`

```
A = {}
```
→ `A=\emptyset`

`{element : condition}` and `{element | condition}` are the same thing — a set builder; the colon and the single `|` spelling are interchangeable and byte-identical:

```
{x : x > 0}
```
→ `\left\{x\ \middle|\ x>0\right\}`

```
{x | x > 0}
```
→ `\left\{x\ \middle|\ x>0\right\}` — identical.

The condition may be written as an English sentence — this is standard set-builder convention, and MathScript typesets the words as text spliced with whatever notation is among them:

```
{n : n is prime}
```
→ `\left\{n\ \middle|\ n\text{ is prime}\right\}`

Putting it together:

```
{ x in Math.reals : exists n in Math.naturals suchthat |x| < 1/n } = {0}
```
→ `\left\{x\in\mathbb{R}\ \middle|\ \exists n\in\mathbb{N}\text{ s.t. }|x|<\frac{1}{n}\right\}=\{0\}`

### Matrices and cases

`matrix(...)`, `bmatrix(...)`, `vmatrix(...)` each take one `[[row1], [row2], ...]` literal, and choose parens, brackets, or vertical bars respectively:

```
bmatrix([[1, 0], [0, 1]])
```
→ `\begin{bmatrix}1 & 0\\ 0 & 1\end{bmatrix}`

```
vmatrix([[a, b], [c, d]]) = a*d - b*c
```
→ `\begin{vmatrix}a & b\\ c & d\end{vmatrix}=a\cdot d-b\cdot c`

A cell can hold anything, including its own fraction:

```
matrix([[1/2, 0], [0, 1/3]])
```
→ `\begin{pmatrix}\frac{1}{2} & 0\\ 0 & \frac{1}{3}\end{pmatrix}`

A matrix literal can be split across several lines — the document layer merges them automatically before parsing:

```
M = matrix([[1, 0],
[0, 1]])
```
→ `M=\begin{pmatrix}1 & 0\\ 0 & 1\end{pmatrix}` (one statement, zero diagnostics)

`cases { branch if condition; branch2 if condition2; ... }` is a piecewise function; a branch can end in the literal word `otherwise` instead of a condition:

```
f(x) = cases { x^2 if x >= 0; -x otherwise }
```
→ `f(x)=\begin{cases}x^{2} & \text{if }x\ge 0\\ -x & \text{otherwise}\end{cases}`

A `cases{}` with **no conditions at all** — every branch bare — is read as a braced *system of equations*, not a piecewise function; `otherwise` is never invented for a branch that didn't ask for it:

```
cases { x = 0; y = 1 }
```
→ `\begin{cases}x=0\\ y=1\end{cases}`

Like a matrix literal, a `cases{}` body can span multiple lines; the document layer merges them and inserts a synthetic `;` between merged lines automatically:

```
f(x) = cases {
  x^2 if x >= 0
  -x otherwise
}
```
→ the same output as the single-line version above.

### Absolute value and divides (`|`)

`|x|` is always `\left|x\right|`, growing with its contents. Nesting and juxtaposition both work:

```
||x| - |y|| <= |x - y|
```
→ `\left|\left|x\right|-\left|y\right|\right|\le\left|x-y\right|`

```
2|x|
```
→ `2\left|x\right|`

A `|` with no partner bar anywhere ahead in the same clause is read as **"divides"** instead — a relation, `\mid`:

```
n | m
```
→ `n\mid m`

The search for a partner bar stops at a relation/logic operator or a clause boundary (a comma, semicolon, colon, quantifier word, or closing bracket), so two unrelated bars in the same statement don't get mistaken for a pair:

```
d | n AND |S| = 3
```
→ `d\mid n\land\left|S\right|=3` — the `AND` stops the search, so `d | n` reads as divides and `|S|` reads as absolute value, correctly, in the same line.

### Vectors (`<a, b, c>`)

Angle brackets read as a vector only under all of these conditions at once: the `<` sits where something new could start (start of a clause, or right after an operator/bracket/comma), a matching `>` exists later in the *same statement*, there's at least one top-level comma between them, and no relational or arrow operator (another `<`/`>`, `=`, `!=`, `<=`, `>=`, `->`, `=>`, `<=>`) sits in between. Otherwise `<` and `>` are the ordinary comparison operators.

```
v = <1, 2, 3>
```
→ `v=\langle 1, 2, 3\rangle`

```
|x - y| < delta => |f(x) - f(y)| < eps
```
→ `\left|x-y\right|<\delta\implies\left|f(x)-f(y)\right|<\varepsilon` — an epsilon-delta statement full of `<` signs, correctly read as comparisons throughout, not vectors.

### Primes (`'`)

`F'(x)` — the prime attaches to the function's **name**, not to its call, so it prints back exactly `F'(x)`, never `F(x)'`:

```
F'(x) = f(x)
```
→ `F'(x)=f(x)`

Primes chain (`f''(x)` → two literal quote marks, which KaTeX renders as a double prime), and work on a bare symbol too:

```
phi' = 0
```
→ `\phi'=0`

### Ellipsis (`...`)

Exactly three dots — not two, not four — is one token, `\ldots`:

```
{1, ..., n}
```
→ `\{1, \ldots, n\}`

```
a_1 + ... + a_n
```
→ `a_{1}+\ldots+a_{n}`

### Factorial (`!`)

Postfix `!` and the `factorial(...)` call are the **same construct**:

```
factorial(n) = n!
```
→ `n!=n!`

A compound operand needs its own parentheses, and a factorial *of* a factorial keeps them for a different reason — `n!!` is LaTeX's own **double factorial** (n(n-2)(n-4)···), a different function from `(n!)!`:

```
(n+1)!
```
→ `(n+1)!`

```
factorial(factorial(n))
```
→ `(n!)!` — not `n!!`.

It binds tighter than a product, same as a prime:

```
2*n!
```
→ `2\cdot n!`

## Symbol tables

Pulled directly from `language.ts` — every table below is the complete, real thing, not an excerpt.

### Greek letters

| name | LaTeX | | name | LaTeX | | name | LaTeX |
|---|---|---|---|---|---|---|---|
| `alpha` | `\alpha` | | `zeta` | `\zeta` | | `upsilon` | `\upsilon` |
| `beta` | `\beta` | | `eta` | `\eta` | | `Delta` | `\Delta` |
| `gamma` | `\gamma` | | `chi` | `\chi` | | `Gamma` | `\Gamma` |
| `delta` | `\delta` | | `psi` | `\psi` | | `Theta` | `\Theta` |
| `epsilon` | `\epsilon` | | `nu` | `\nu` | | `Lambda` | `\Lambda` |
| `theta` | `\theta` | | `kappa` | `\kappa` | | `Sigma` | `\Sigma` |
| `lambda` | `\lambda` | | `iota` | `\iota` | | `Omega` | `\Omega` |
| `sigma` | `\sigma` | | `xi` | `\xi` | | `Pi` | `\Pi` |
| `omega` | `\omega` | | | | | `Phi` | `\Phi` |
| `pi` | `\pi` | | | | | `Psi` | `\Psi` |
| `mu` | `\mu` | | | | | `Xi` | `\Xi` |
| `phi` | `\phi` | | | | | | |
| `rho` | `\rho` | | | | | | |
| `tau` | `\tau` | | | | | | |

Only 10 of these have a listed uppercase form — `Delta Gamma Theta Lambda Sigma Omega Pi Phi Psi Xi`, exactly the ones in the third column above. The rest (`alpha beta epsilon zeta eta mu rho tau chi nu kappa iota upsilon`) don't: there's no `Chi`, `Nu`, `Alpha`, and so on. Capitalization selects a different symbol, not a variant spelling of the same one — type the exact case shown in the table.

Three more names share the same lookup table internally but aren't Greek letters:

| name | LaTeX | what it is |
|---|---|---|
| `eps` | `\varepsilon` | shorthand for a script-style epsilon — distinct from spelling out `epsilon`, which gives the loopy `\epsilon` |
| `partial` | `\partial` | the partial-derivative symbol |
| `inf` | `\infty` | infinity |

### Operators, logic, and sets

| MathScript | LaTeX | | MathScript | LaTeX |
|---|---|---|---|---|
| `->` | `\to` | | `AND` | `\land` |
| `=>` | `\implies` | | `OR` | `\lor` |
| `<=>` | `\iff` | | `NOT` | `\neg` |
| `!=` | `\neq` | | `and` | `\land` *(context-dependent — see [Logic](#logic))* |
| `<=` | `\le` | | `or` | `\lor` *(context-dependent)* |
| `>=` | `\ge` | | `not` | `\neg` *(context-dependent)* |
| `+-` | `\pm` | | `exists` | `\exists` |
| `-+` | `\mp` | | `forall` | `\forall` |
| `dot` | `\cdot` | | `in` | `\in` *(context-dependent)* |
| `inf` | `\infty` | | `notin` | `\notin` |
| `suchthat` | `\text{ s.t. }` | | `subset` | `\subset` |
| `QED` | `\blacksquare` | | `union` | `\cup` |
| `\|` (no partner) | `\mid` | | `intersect` | `\cap` |
| `{}` | `\emptyset` | | `implies` | `\implies` |
| | | | `iff` | `\iff` |

### The `Math.*` package

| MathScript | LaTeX |
|---|---|
| `Math.pi` | `\pi` |
| `Math.e` | `e` |
| `Math.inf` | `\infty` |
| `Math.reals` | `\mathbb{R}` |
| `Math.naturals` | `\mathbb{N}` |
| `Math.integers` | `\mathbb{Z}` |
| `Math.rationals` | `\mathbb{Q}` |
| `Math.complex` | `\mathbb{C}` |

```
Math.integers union Math.rationals union Math.complex
```
→ `\mathbb{Z}\cup\mathbb{Q}\cup\mathbb{C}`

### Geometry

| MathScript | LaTeX | | MathScript | LaTeX |
|---|---|---|---|---|
| `perp` | `\perp` | | `similar` | `\sim` |
| `parallel` | `\parallel` | | `corresponds` | `\triangleq` |
| `angle` | `\angle` | | `triangle` | `\triangle` |
| `measuredangle` | `\measuredangle` | | `degree` | `^{\circ}` |
| `sphericalangle` | `\sphericalangle` | | `overline(AB)` | `\overline{AB}` |
| `rightangle` | `\measuredangle` | | `ray(AB)` | `\overrightarrow{AB}` |
| `congruent` | `\cong` | | `arc(AB)` | `\overset{\frown}{AB}` |

```
a parallel b and c perp d
```
→ `a\parallel b\land c\perp d`

```
a congruent b and c similar d
```
→ `a\cong b\land c\sim d`

These relation words score like any other ambiguous word when their operands are multi-letter names rather than single letters — see [Known limitations](#known-limitations).

## Text vs. math: how MathScript reads your intent

Write naturally. You don't mark anything as "this part is math" — MathScript reads it from context the way a human reader would, and only two things are ever explicitly marked: `"..."` is always text, `$...$` is always math.

**Settled outright, no guessing involved:**

- Quoted text (`"..."`) is always text; `$...$` is always math.
- A name written **tight against `(`** — a call, like `sin(x)` or `Im(f)` — puts everything inside it in math: known function names and unknown ones alike, as long as (for an unrecognized multi-word name) what's inside doesn't itself read as an English aside. `Im(f)`, `Aut(G)`, `speed(t)` are calls; `Note (this is important)` — with a space before the parenthesis — reads as an English parenthetical instead, not an application. See [Functions](#functions) for the exact adjacency rule.
- Anything inside a `Math.*` member, a subscript/superscript argument, a `cases{}`/`matrix()` body, or a set-builder's element side, is math.
- A known symbol or keyword (a Greek letter, `forall`, `subset`, a function name, ...) is math. A common English word — articles, auxiliary verbs, prepositions, proof verbs like "assume"/"suppose"/"show", math-adjacent adjectives like "continuous"/"bounded" — is text.

**Everything genuinely ambiguous** — single letters, `and`/`or`/`not`, `in`, the word `a`/`A`, an unrecognized multi-character word, a function keyword used with no parentheses (`sum`, `lim`, ...) — is judged by what's around it:

- **A single letter almost always reads as math**, even sitting in the middle of an English sentence: "f is continuous" keeps `f` as a variable.
- **Neighboring words matter.** Math-looking neighbors (numbers, operators, other math) pull a word toward math; English-looking neighbors pull it toward text.
- **The whole sentence matters for `and`/`or`/`not`.** The exact same shape reads as English inside a sentence that has other English words in it, and as logic inside a line that's otherwise pure notation — compare `Let a and b be real numbers...` (English) against `x in A and y in B => x + y in A union B` (logic).
- **A comma right before `and`/`or`** (the Oxford-comma shape, "..., and ...") is an English tell, unless it's inside a plain list or a call's argument list, where a comma means nothing of the sort.
- **Sentence openers introduce, they don't infect.** Words like "Let", "Assume", "Then", "Since", "Therefore" read as English on their own, but don't make the *rest* of the line look mathematical just because the line opens that way — "Let p and q be given" is exactly as much evidence that `and` is English as "Assume p and q" is (i.e., none from the opener itself; the rest of the sentence still earns its own verdict).
- **A word right after "Let"/"Assume"/"Show"/... that's a single letter is being introduced as a variable**: "Let x be arbitrary."
- **`a`/`A` reads as the English article** unless it's clearly being introduced as a variable. "Let a be a real number" — the first `a` is a variable (introduced right after "Let"), the second is the article (it's followed by a noun phrase that doesn't itself resolve to math). The app looks at what immediately follows the word and how that phrase ends to tell the two apart. A call form always wins outright: `a(x) = x^2` reads `a` as a function name, unconditionally.
- **`in` reads as set membership** next to an operand-shaped neighbor on the left and a set-shaped neighbor on the right (`x in A`, `n in Math.naturals`, `x in (a, b)`), and as the English preposition otherwise ("the answer lies in the interval").

A genuinely ambiguous case — where the evidence cancels out exactly — gets called out with an info diagnostic instead of a silent guess:

```
Find a real number x such that x^2 = 2
```
→ `\text{Find a real number }x\text{ such that }x^{2}=2`, plus:
```
info: 'a' is ambiguous here — reading it as text
hint: write $a$ (or a(...)) to force math, or "a" to force text
```

Whenever the automatic reading is wrong, reach for the escape hatches — wrap the word in `$...$` to force math, or in `"..."` to force text.

## Diagnostics

Every diagnostic carries a severity (`info` or `warn`), a source span, a message, and sometimes a hint. The editor's line-number gutter shows one dot per line that has any diagnostic (warn wins over info if a line has both); hovering the dot lists every message for that line. The same diagnostics also list in the console panel with their line numbers.

The complete catalog:

| severity | message | when |
|---|---|---|
| info | `'<word>' is ambiguous here — reading it as text` | a word's math/text score is a genuine tie (see [Text vs. math](#text-vs-math-how-mathscript-reads-your-intent)) |
| info | `unclosed scope: <Name>` | a scope's `}` never arrives before end of file |
| info | `unclosed subtask` | same, for a dash subtask |
| info | `unclosed claim` | same, for a `?:` claim |
| warn | `unmatched } — ignored` | a `}` with nothing open to close |
| warn | `#define <NAME> has no replacement — ignored` | `#define NAME` with nothing after the name |
| warn | `unclosed cases — merged to end of file` / `unclosed matrix — merged to end of file` | a `cases{`/`matrix(`-family body never balances before end of file |
| warn | `unterminated quote — treated as text` | a `"` with no closing `"` before the end of its line |
| warn | `unterminated $ — treated as math` | a `$` with no closing `$` before the end of its line |
| warn | `expression ends early — missing operand` | an operator has nothing after it to act on |
| warn | `unclosed \| — treated as absolute value` | a `\|` opened as an absolute value never finds its closing `\|` |
| warn | `could not parse '<text>' — rendered as-is` | a span the parser can't make sense of at all |

**The engine never hard-fails.** Every stage — lexer, document parser, expression parser — recovers instead of throwing. A span the parser can't make sense of renders as literal monospace text (visually distinct from compiled math) with a `could not parse` diagnostic explaining what was skipped, rather than blanking the preview or crashing the app:

```
x = @@@ + 1
```
→ `x=` followed by `@@@ +` rendered in monospace (visually flagged as unparsed), then `1` — with a `could not parse '@@@ +'` diagnostic. The rest of the document keeps compiling normally.

```
y = 
```
→ `y=`, plus `expression ends early — missing operand` — this fires constantly while you're mid-keystroke (an operator with nothing typed after it yet) and is meant to be transient, not alarming.

## Structure highlighting

As the editor caret moves, the preview tints the smallest **structural** node containing it — no recompile, just that one line re-rendering with the relevant subtree wrapped for a background tint.

**What counts as structural** (worth tinting): fractions, powers, subscripts, function calls, big operators, set builders, absolute values, matrices, cases, and relations. A bare variable or number alone doesn't tint on its own; a caret sitting in prose, or on unparsed (`Raw`) text, tints nothing.

**A fraction's numerator and denominator are each their own selectable half** — the one exception to "tint the smallest enclosing structural node as a whole." A caret inside the denominator tints just the denominator, not the whole fraction bar:

```
(x+1)/(x-1) = y^2 + 1
```
caret inside `x-1` →
```
\htmlClass{hl-lhs}{\frac{x+1}{\htmlClass{hl-node}{x-1}}}=\htmlClass{hl-rhs}{y^{2}+1}
```
caret on the `2` in `y^2` →
```
\htmlClass{hl-lhs}{\frac{x+1}{x-1}}=\htmlClass{hl-rhs}{\htmlClass{hl-node}{y^{2}}+1}
```

**Equation sides:** when the caret's line states a pure comparison chain (see [Relations and chains](#relations-and-chains) — only `= != < > <= >=`, no mixing with membership/logic), its operand regions *also* get two alternating tints for as long as the caret is anywhere on that line, independent of exactly which node the caret landed on — literally showing which side is which. A longer chain alternates straight through rather than treating it as "first side vs. the rest":

```
a = b < c
```
caret on `a` (the whole line, since a bare variable isn't structural on its own — the caret climbs to the nearest structural ancestor, here the whole Relation) →
```
\htmlClass{hl-node}{\htmlClass{hl-lhs}{a}=\htmlClass{hl-rhs}{b}<\htmlClass{hl-lhs}{c}}
```
(`a` and `c` share a tint, `b` gets the other — three operands, two alternating classes.)

**CSS classes**, for anyone extending the preview (`components/Preview.tsx`):

| class | meaning |
|---|---|
| `hl-node` | the caret's own node |
| `hl-lhs` / `hl-rhs` | the alternating equation-side tints, described above |
| `raw-span` | unparsed text (see [Diagnostics](#diagnostics)) — shown in monospace, not tinted by the caret, but visually marked as "not compiled" |

All three are background-only tints — no padding, border, or font change — so a tint appearing or disappearing as the caret moves never reflows the equation it's sitting on.

## Known limitations

Real gaps, written down rather than left to surprise you. None of these fail — they're all silent readings that land somewhere other than what you might expect, with no diagnostic.

1. **The half-glued dot product, `fdot g`, isn't recognized.** `fdotg` (fully glued) and `f dot g` (fully spaced) both give `f\cdot g`; `fdot g` (half-glued) does not — it reads as the ordinary word "fdot" followed by `g`:
   ```
   fdotg = 1        →  f\cdot g=1
   f dot g = 1      →  f\cdot g=1
   fdot g = 1       →  \text{fdot }g=1
   ```
   Stick to one of the two working spellings.

2. **Multi-character identifiers glue to their neighbors with no spacing**, outside of a set-builder condition:
   ```
   x divides y
   ```
   → `x\mathrm{divides}y` — reads as a product of three factors, not a sentence. The same word inside a set-builder condition is fine, because that path routes English through `\text{}` on purpose:
   ```
   {d : d divides n}
   ```
   → `\left\{d\ \middle|\ d\text{ divides }n\right\}`

   Work around it with the `"..."` escape hatch, or rephrase around a recognized relation word.

3. **The geometry keywords always win over prose, with no diagnostic.** `triangle`, `angle`, `parallel`, `degree`, `congruent` (and their relation-word siblings `similar`/`perp`/`corresponds`) are claimed as notation absolutely, even in the middle of an ordinary sentence:
   ```
   the triangle inequality holds
   ```
   → `\text{the }\triangle\text{ inequality holds}` — a stray `\triangle` glyph dropped into English prose.

   (`partial` used to have exactly this problem and was fixed — it now scores contextually, the same way `and`/`or`/`not` do. The geometry words haven't been, because their notational form needs multi-letter point-label operands, which themselves would score as prose — fixing this needs point-label support first, see the next item.)

4. **Multi-letter geometry point labels aren't recognized as a unit outside the accent functions.** `overline(AB)`, `ray(AB)`, `arc(AB)` special-case their argument as a point label (see [Functions](#functions)) — but a *bare* multi-letter name next to a relation word like `parallel`/`congruent` gets no such treatment, and falls back to ordinary per-word scoring, which can read the exact same shape of word as math or prose depending only on which side of the sentence it sits:
   ```
   triangle ABC congruent triangle DEF
   ```
   → `\triangle\mathrm{ABC}\cong\triangle\ \text{DEF}` — `ABC` (flanked by notation on both sides) reads as math; `DEF` (flanked by notation on only one side, since it's the last word in the statement) reads as prose. Both are "the same kind of thing" to a human reader; MathScript currently disagrees with itself about which one it is.
