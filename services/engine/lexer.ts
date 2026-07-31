// MathBrain Engine v2 - Lexer
//
// Scans MathScript source into a flat token stream. Rule 1 of the plan:
// unicode is normalized FIRST, and every span produced below is measured
// against that NORMALIZED text - which is why lex() returns it alongside
// the tokens (downstream span consumers, e.g. Task 7's nodeAt(line,col),
// must slice the same text the spans were computed against, not the
// original source).
//
// This is a single hand-written scanner (`while (i < text.length)`) with
// greedy longest-match for multi-character operators. It does no
// special-casing of keywords (Math.xxx, forall, dot, ...) - those come out
// as plain WORD tokens here; later stages (parser/disambiguator) give them
// meaning.

import type { Token, TokenKind, Span, Diagnostic } from './types';

// ---- Rule 1: unicode normalization ----
// A plain substitution pass (not a tokenizing regex - the actual token
// scanner below is the hand-written loop the plan calls for).
//   ∣│∥ -> |          (vertical bar variants -> ascii pipe)
//   ·•∙ -> ' dot '    (multiplication dot variants -> spaced word)
//   ≤ -> <=, ≥ -> >=, ≠ -> !=, → -> ->
// None of these six source characters or their replacement text overlap,
// so the order of the chained replacements below cannot change the result.
function normalizeSource(source: string): string {
  return source
    .replace(/[∣│∥]/g, '|')
    .replace(/[·•∙]/g, ' dot ')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/→/g, '->');
}

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';
const isLetter = (ch: string | undefined): boolean =>
  ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
const isLetterOrDigit = (ch: string | undefined): boolean => isLetter(ch) || isDigit(ch);

// Rule 2: multi-char OPs, greedy longest-match first, checked in the exact
// order the plan specifies. No ambiguity arises from the order: within each
// length class no two entries share the same first two characters (e.g.
// '->' and '-+' both start with '-' but are disambiguated by their second
// character), so which one is tried first never matters.
const THREE_CHAR_OPS = ['<=>'];
const TWO_CHAR_OPS = ['=>', '->', '!=', '<=', '>=', '+-', '-+'];
const SINGLE_CHAR_OPS = new Set(['=', '<', '>', '+', '-', '*', '/', '^', '_', "'", '|', ':', ';', ',', '.']);

const BRACKETS: Partial<Record<string, TokenKind>> = {
  '(': 'LPAREN', ')': 'RPAREN',
  '[': 'LBRACKET', ']': 'RBRACKET',
  '{': 'LBRACE', '}': 'RBRACE',
};

export function lex(source: string): { tokens: Token[]; diagnostics: Diagnostic[]; normalized: string } {
  const text = normalizeSource(source);
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];

  let i = 0;
  let line = 1;
  let col = 0;

  const push = (kind: TokenKind, tokenText: string, span: Span) => {
    tokens.push({ kind, text: tokenText, span });
  };

  while (i < text.length) {
    const ch = text[i];

    // Newline -> its own NEWLINE token; then advance to the next line.
    if (ch === '\n') {
      push('NEWLINE', '\n', { startLine: line, startCol: col, endLine: line, endCol: col + 1 });
      i += 1; line += 1; col = 0;
      continue;
    }

    // Rule 6: whitespace (spaces/tabs) - no token, just advances columns.
    if (ch === ' ' || ch === '\t') {
      i += 1; col += 1;
      continue;
    }

    // Comment: `//` swallows to end of line. Token text includes the `//`.
    if (ch === '/' && text[i + 1] === '/') {
      const startLine = line, startCol = col;
      const start = i;
      i += 2; col += 2;
      while (i < text.length && text[i] !== '\n') { i += 1; col += 1; }
      push('COMMENT', text.slice(start, i), { startLine, startCol, endLine: startLine, endCol: col });
      continue;
    }

    // Rule 3: "..." -> STRING (text excludes the quotes). Unterminated
    // (no closing quote before EOL/EOF) recovers by running to end of line
    // and emitting a warn diagnostic.
    if (ch === '"') {
      const startLine = line, startCol = col;
      i += 1; col += 1; // consume opening quote
      const contentStart = i;
      while (i < text.length && text[i] !== '"' && text[i] !== '\n') { i += 1; col += 1; }
      const terminated = i < text.length && text[i] === '"';
      const content = text.slice(contentStart, i);
      if (terminated) { i += 1; col += 1; } // consume closing quote
      push('STRING', content, { startLine, startCol, endLine: startLine, endCol: col });
      if (!terminated) {
        diagnostics.push({
          span: { startLine, startCol, endLine: startLine, endCol: col },
          severity: 'warn',
          message: 'unterminated quote — treated as text',
        });
      }
      continue;
    }

    // Rule 3: $...$ -> MATH_QUOTE, same recovery shape as STRING.
    if (ch === '$') {
      const startLine = line, startCol = col;
      i += 1; col += 1; // consume opening $
      const contentStart = i;
      while (i < text.length && text[i] !== '$' && text[i] !== '\n') { i += 1; col += 1; }
      const terminated = i < text.length && text[i] === '$';
      const content = text.slice(contentStart, i);
      if (terminated) { i += 1; col += 1; } // consume closing $
      push('MATH_QUOTE', content, { startLine, startCol, endLine: startLine, endCol: col });
      if (!terminated) {
        diagnostics.push({
          span: { startLine, startCol, endLine: startLine, endCol: col },
          severity: 'warn',
          message: 'unterminated $ — treated as math',
        });
      }
      continue;
    }

    // Rule 4: NUMBER = \d+(\.\d+)? - the dot only joins the number when a
    // digit follows it, so 'Math.reals' and a trailing '3.' both leave the
    // '.' for the OP scanner below.
    if (isDigit(ch)) {
      const startLine = line, startCol = col;
      const start = i;
      while (isDigit(text[i])) { i += 1; col += 1; }
      if (text[i] === '.' && isDigit(text[i + 1])) {
        i += 1; col += 1; // consume '.'
        while (isDigit(text[i])) { i += 1; col += 1; }
      }
      push('NUMBER', text.slice(start, i), { startLine, startCol, endLine: startLine, endCol: col });
      continue;
    }

    // Rule 4: WORD = [A-Za-z][A-Za-z0-9]* (no underscore - '_' is an OP, so
    // `a_i` lexes as WORD OP WORD).
    if (isLetter(ch)) {
      const startLine = line, startCol = col;
      const start = i;
      i += 1; col += 1;
      while (isLetterOrDigit(text[i])) { i += 1; col += 1; }
      push('WORD', text.slice(start, i), { startLine, startCol, endLine: startLine, endCol: col });
      continue;
    }

    // Brackets get their own kinds.
    const bracketKind = BRACKETS[ch];
    if (bracketKind) {
      push(bracketKind, ch, { startLine: line, startCol: col, endLine: line, endCol: col + 1 });
      i += 1; col += 1;
      continue;
    }

    // Rule 2: multi-char OPs, greedy longest-match first, then singles.
    const three = text.slice(i, i + 3);
    if (THREE_CHAR_OPS.includes(three)) {
      push('OP', three, { startLine: line, startCol: col, endLine: line, endCol: col + 3 });
      i += 3; col += 3;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      push('OP', two, { startLine: line, startCol: col, endLine: line, endCol: col + 2 });
      i += 2; col += 2;
      continue;
    }
    if (SINGLE_CHAR_OPS.has(ch)) {
      push('OP', ch, { startLine: line, startCol: col, endLine: line, endCol: col + 1 });
      i += 1; col += 1;
      continue;
    }

    // Fallback: a character matching none of the rules above (e.g. a lone
    // '!' not followed by '=', or a stray symbol outside the rule-1
    // normalization table). The spec's rules don't define this case; rather
    // than dropping the character silently or throwing, emit it as its own
    // PUNCT token - the one TokenKind in types.ts no rule above otherwise
    // produces - so no input vanishes and later stages can flag it.
    push('PUNCT', ch, { startLine: line, startCol: col, endLine: line, endCol: col + 1 });
    i += 1; col += 1;
  }

  return { tokens, diagnostics, normalized: text };
}
