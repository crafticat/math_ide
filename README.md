# MathBrain IDE

A browser-based mathematical notation editor that compiles MathScript syntax to LaTeX, rendered in real-time via KaTeX.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the app:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3000 in your browser

## MathScript Syntax

MathBrain IDE uses a custom "MathScript" language that compiles to LaTeX:

### Scopes
```
Problem My Problem Title {
  Theorem Important Result {
    ...
  }
  Proof {
    ...
  }
}
```
Supported: `Problem`, `Theorem`, `Proof`, `Case`, `Lemma`, `Section`, `Part`, `Subproblem`

### Functions
| MathScript | LaTeX |
|------------|-------|
| `sqrt(x)` | `\sqrt{x}` |
| `integral(a -> b)` | `\int_{a}^{b}` |
| `sum(i=1 -> n)` | `\sum_{i=1}^{n}` |
| `lim_(x -> 0)` | `\lim_{x \to 0}` |
| `choose(n, k)` | `\binom{n}{k}` |
| `factorial(n)` | `n!` |

### Fractions
```
a/b              -> \frac{a}{b}
(a+b)/(c+d)      -> \frac{a+b}{c+d}
```

### Subscripts & Superscripts
```
a_i              -> a_{i}
x^2              -> x^{2}
e^(i*pi)         -> e^{i*pi}
```

### Absolute Value
```
|x - a|          -> \left|x - a\right|
```

### Logic & Sets
| MathScript | Symbol |
|------------|--------|
| `exists` | `\exists` |
| `forall` | `\forall` |
| `suchthat` | s.t. |
| `in` | `\in` |
| `notin` | `\notin` |
| `subset` | `\subset` |
| `union` | `\cup` |
| `intersect` | `\cap` |
| `AND` | `\land` |
| `OR` | `\lor` |
| `NOT` | `\neg` |

### Operators
| MathScript | Symbol |
|------------|--------|
| `+-` | `\pm` |
| `-+` | `\mp` |
| `=>` | `\implies` |
| `<=>` | `\iff` |
| `!=` | `\neq` |
| `<=` | `\le` |
| `>=` | `\ge` |

### Greek Letters
`alpha`, `beta`, `gamma`, `delta`, `epsilon`, `theta`, `lambda`, `sigma`, `omega`, `pi`, `mu`, `phi`, `rho`, `tau`, and more.

### Macros
Define shortcuts for commonly used symbols:
```
#define eps epsilon
#define R Math.reals

// Now use them:
forall eps > 0, exists x in R
```

### Math Package
| MathScript | Symbol |
|------------|--------|
| `Math.pi` | `\pi` |
| `Math.e` | `e` |
| `Math.inf` | `\infty` |
| `Math.reals` | `\mathbb{R}` |
| `Math.naturals` | `\mathbb{N}` |
| `Math.integers` | `\mathbb{Z}` |
| `Math.rationals` | `\mathbb{Q}` |
| `Math.complex` | `\mathbb{C}` |

## Build for Production

```bash
npm run build
```
