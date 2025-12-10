# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Build for production
node test-advanced.mjs  # Run 100 compiler test cases
```

## Architecture

MathBrain IDE is a React-based mathematical notation editor that compiles a custom "MathScript" syntax to LaTeX, rendered via KaTeX.

### Core Data Flow

1. User types MathScript in `Editor.tsx`
2. Content change triggers debounced compilation (300ms) in `App.tsx`
3. `services/compiler.ts` transforms MathScript → LaTeX
4. `Preview.tsx` renders LaTeX using KaTeX

### Key Files

- **`services/compiler.ts`** - The MathScript-to-LaTeX compiler. Uses a placeholder system (`__PH0__`, `__PH1__`, etc.) to protect complex LaTeX constructs (integrals, fractions, sqrt) from tokenization, then restores them after text/math segmentation.

- **`constants.ts`** - Contains `INITIAL_CONTENT` (example document), `THEME` colors, and `AUTOCOMPLETE_DATA` for editor suggestions. Autocomplete templates use `$0` to mark cursor position.

- **`components/Editor.tsx`** - Code editor with syntax highlighting, autocomplete, auto-indentation. Uses `document.execCommand('insertText')` for undo-compatible text insertion.

### MathScript Syntax



The compiler recognizes:
- **Scopes**: `Problem`, `Theorem`, `Proof`, `Case`, `Lemma` with `{ }` blocks
- **Functions**: `sqrt(x)`, `integral(a -> b)`, `sum(i=1 -> n)`, `lim_(x -> 0)`, `choose(n, k)`, `factorial(n)`
- **Fractions**: `a/b` or `(a+b)/(c+d)`
- **Subscripts/Superscripts**: `a_i`, `x^2`
- **Logic**: `AND`, `OR`, `NOT`, `exists`, `forall`, `suchthat`
- **Operators**: `+-` (±), `-+` (∓), `=>`, `<=>`, `!=`, `<=`, `>=`
- **Greek**: `alpha`, `beta`, `delta`, etc.
- **Sets**: `in`, `notin`, `subset`, `union`, `intersect`

### Compiler Internals

The compiler uses smart text/math segmentation:
- Single characters → math variables
- Multi-character words → text (wrapped in `\text{}`)
- Keywords in `mathKeywords` set → always math
- Stop words in `textStopWords` set → always text

Placeholders prevent nested constructs from being mangled by the tokenizer.
