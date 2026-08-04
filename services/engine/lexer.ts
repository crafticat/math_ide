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
// None of these ten source characters (three pipe variants, three dot
// variants, four single-char relations/arrow - across these six
// replacement rules) or their replacement text overlap, so the order of
// the chained replacements below cannot change the result.
function normalizeSource(source: string): string {
  return source
    .replace(/[∣│∥]/g, '|')
    .replace(/[·•∙]/g, ' dot ')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/→/g, '->');
}

// Maps a caret's RAW column (the editor's own coordinates, before
// normalization) onto the NORMALIZED column every span in this engine is
// measured against - e.g. the `·` in `2·x` is one raw character but five
// normalized ones (` dot `), so a caret sitting after it needs a +4 shift to
// still land on the token it visually sits on. `rawLine` is the SOURCE line
// the caret is on (one line of the original, un-normalized document) -
// engine.ts's nodeAt() is the only caller, and the only place a caret
// crosses from editor coordinates into engine coordinates.
//
// The two early returns are DELIBERATELY not clamped into [0, rawLine.length]:
// an out-of-range rawCol (negative, or past the end of the line) must map to
// an equally out-of-range normalized col, so that a caret there still misses
// every span and nodeAt still returns null - clamping would silently pull an
// invalid caret onto a valid one.
export function normalizedCol(rawLine: string, rawCol: number): number {
  if (rawCol <= 0) return rawCol;
  if (rawCol >= rawLine.length) return normalizeSource(rawLine).length + (rawCol - rawLine.length);
  return normalizeSource(rawLine.slice(0, rawCol)).length;
}

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';
const isLetter = (ch: string | undefined): boolean =>
  ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
const isLetterOrDigit = (ch: string | undefined): boolean => isLetter(ch) || isDigit(ch);

// Rule 2: multi-char OPs, greedy longest-match first, checked in the exact
// order the plan specifies (three-char class, then two-char, then single).
// Matching within a class is exact fixed-length string equality (a
// three/two-char substring tested with `.includes` against the list
// below) - i.e. plain set membership - so no entry's position in its own
// list can ever change which one matches; only the class-to-class order
// (longest first) matters.
// '...' is here rather than in the PUNCT/single-'.' path because an ellipsis
// is ONE symbol (`\ldots`) in `{1, ..., n}` / `a_1 + ... + a_n`, not three
// sentence periods: as three separate OP:'.' tokens the parser recovered the
// first one as Raw and printed the other two literally. Only the exact
// three-dot spelling is a token - `..` stays two periods.
const THREE_CHAR_OPS = ['<=>', '...'];
const TWO_CHAR_OPS = ['=>', '->', '!=', '<=', '>=', '+-', '-+'];
// '!' is in the list for the same reason "'" is: it is a real postfix
// operator of the language (`(j-1)!`, `5!`), not stray punctuation. '!=' is
// matched by the two-char class above first, so only a '!' that is NOT part
// of '!=' reaches here.
const SINGLE_CHAR_OPS = new Set(['=', '<', '>', '+', '-', '*', '/', '^', '_', "'", '|', ':', ';', ',', '.', '!']);

// Rule 4's one word-splitting shape: `fdotg` -> `f dot g` (see the WORD
// branch below). Anchored, so only a whole word of exactly this shape splits.
const GLUED_DOT = /^([A-Za-z])dot([A-Za-z])$/;

// Rule 4's other word-joining shape: an English CONTRACTION or POSSESSIVE
// (`Euler's`, `don't`, `it's`) is ONE word, not a word followed by the prime
// operator - split in three it left `\text{By Euler}\texttt{'}s` behind, the
// apostrophe stranded in a math run of its own.
//
// Like GLUED_DOT this is a pure SHAPE test (the lexer knows no vocabulary),
// and deliberately narrow so it can never swallow a derivative:
//   * the base must be at least TWO characters, so `F'`/`f'` are untouched;
//   * everything must be written tight, no spaces anywhere;
//   * the tail must be exactly one of the English contraction suffixes, so
//     `Aut'(G)` (next char is `(`) and `phi' = 0` (nothing after the quote)
//     are untouched too.
const CONTRACTION_SUFFIXES = new Set(['s', 't', 'd', 'm', 'll', 're', 've']);

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

  // Advances `i` and `col` together by `n` (default 1) - the shape every
  // scan below uses except the '\n' branch, which resets `col` to 0 on a
  // new line instead of incrementing it.
  const advance = (n = 1) => { i += n; col += n; };

  // All tokens are single-line (even unterminated STRING/MATH_QUOTE/COMMENT
  // recover by stopping at EOL rather than crossing it), so `line` never
  // changes between a token's start and its end - one current-`line` value
  // covers both ends of the span.
  const lineSpan = (startCol: number, endCol: number): Span => ({ startLine: line, startCol, endLine: line, endCol });

  // Rule 3: delim...delim -> a STRING or MATH_QUOTE token (text excludes
  // the delimiters). Unterminated (no closing delim before EOL/EOF)
  // recovers by running to end of line and emitting a warn diagnostic.
  // Shared by both delimiters - the only differences between them are
  // which character closes the token, its TokenKind, and its diagnostic
  // message, so those are the three parameters.
  const scanDelimited = (delim: string, kind: TokenKind, unterminatedMessage: string) => {
    const startCol = col;
    advance(); // consume opening delimiter
    const contentStart = i;
    while (i < text.length && text[i] !== delim && text[i] !== '\n') { advance(); }
    const terminated = i < text.length && text[i] === delim;
    const content = text.slice(contentStart, i);
    if (terminated) { advance(); } // consume closing delimiter
    push(kind, content, lineSpan(startCol, col));
    if (!terminated) {
      diagnostics.push({ span: lineSpan(startCol, col), severity: 'warn', message: unterminatedMessage });
    }
  };

  while (i < text.length) {
    const ch = text[i];

    // Newline -> its own NEWLINE token; then advance to the next line.
    if (ch === '\n') {
      push('NEWLINE', '\n', lineSpan(col, col + 1));
      i += 1; line += 1; col = 0;
      continue;
    }

    // Whitespace (spaces/tabs) - no token, just advances columns. '\r' is
    // treated the same way (rather than falling through to PUNCT) so a
    // CRLF line ending doesn't leave a stray token behind before the '\n'.
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      advance();
      continue;
    }

    // Comment: `//` swallows to end of line. Token text includes the `//`.
    if (ch === '/' && text[i + 1] === '/') {
      const startCol = col;
      const start = i;
      advance(2);
      while (i < text.length && text[i] !== '\n') { advance(); }
      push('COMMENT', text.slice(start, i), lineSpan(startCol, col));
      continue;
    }

    // Rule 3: "..." -> STRING; $...$ -> MATH_QUOTE (see scanDelimited above
    // for the shared recovery behavior).
    if (ch === '"') {
      scanDelimited('"', 'STRING', 'unterminated quote — treated as text');
      continue;
    }
    if (ch === '$') {
      scanDelimited('$', 'MATH_QUOTE', 'unterminated $ — treated as math');
      continue;
    }

    // Rule 4: NUMBER = \d+(\.\d+)? - the dot only joins the number when a
    // digit follows it, so 'Math.reals' and a trailing '3.' both leave the
    // '.' for the OP scanner below.
    if (isDigit(ch)) {
      const startCol = col;
      const start = i;
      while (isDigit(text[i])) { advance(); }
      if (text[i] === '.' && isDigit(text[i + 1])) {
        advance(); // consume '.'
        while (isDigit(text[i])) { advance(); }
      }
      push('NUMBER', text.slice(start, i), lineSpan(startCol, col));
      continue;
    }

    // Rule 4: WORD = [A-Za-z][A-Za-z0-9]* (no underscore - '_' is an OP, so
    // `a_i` lexes as WORD OP WORD).
    //
    // One shape is split rather than pushed whole: the glued dot product
    // `fdotg`, which means exactly what `f dot g` and `f·g` mean. Rule 1
    // already rewrites `·` to a spaced ` dot ` word, so this is the same
    // rewrite for the spelling that has no separator to normalize - done
    // here, on the finished word, because `fdotg` is only one word to the
    // scanner. The split carves the three spans OUT of the word's own span
    // (nothing is inserted into the text), so normalized columns - and every
    // caret mapped through them - are untouched. GLUED_DOT is deliberately
    // narrow: single letter, `dot`, single letter, the whole word. `dotted`,
    // `adotbc` and `fdot` are ordinary words.
    if (isLetter(ch)) {
      const startCol = col;
      const start = i;
      advance();
      while (isLetterOrDigit(text[i])) { advance(); }
      const word = text.slice(start, i);
      const glued = GLUED_DOT.exec(word);
      if (glued) {
        push('WORD', glued[1], lineSpan(startCol, startCol + 1));
        push('WORD', 'dot', lineSpan(startCol + 1, startCol + 4));
        push('WORD', glued[2], lineSpan(startCol + 4, startCol + 5));
        continue;
      }
      // Contraction / possessive (see CONTRACTION_SUFFIXES): absorb `'tail`
      // into the word when the whole thing is written tight and `tail` is a
      // contraction suffix. The lookahead reads `text` directly (it does not
      // move `i`/`col`) so a non-match costs nothing to abandon; the scan runs
      // over letters AND digits so a tail like `s2` fails the set membership
      // instead of matching on its `s` prefix.
      if (word.length >= 2 && text[i] === "'") {
        let k = i + 1;
        while (isLetterOrDigit(text[k])) k++;
        if (CONTRACTION_SUFFIXES.has(text.slice(i + 1, k).toLowerCase())) {
          advance(k - i);
          push('WORD', text.slice(start, i), lineSpan(startCol, col));
          continue;
        }
      }
      push('WORD', word, lineSpan(startCol, col));
      continue;
    }

    // Brackets get their own kinds.
    const bracketKind = BRACKETS[ch];
    if (bracketKind) {
      push(bracketKind, ch, lineSpan(col, col + 1));
      advance();
      continue;
    }

    // Rule 2: multi-char OPs, greedy longest-match first, then singles.
    const three = text.slice(i, i + 3);
    if (THREE_CHAR_OPS.includes(three)) {
      push('OP', three, lineSpan(col, col + 3));
      advance(3);
      continue;
    }
    const two = text.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      push('OP', two, lineSpan(col, col + 2));
      advance(2);
      continue;
    }
    if (SINGLE_CHAR_OPS.has(ch)) {
      push('OP', ch, lineSpan(col, col + 1));
      advance();
      continue;
    }

    // Fallback: a character matching none of the rules above (e.g. '@' or
    // '#', or any stray symbol outside the rule-1 normalization table). The
    // spec's rules don't define this case; rather than dropping the
    // character silently or throwing, emit it as its own
    // PUNCT token - the one TokenKind in types.ts no rule above otherwise
    // produces - so no input vanishes and later stages can flag it. Read via
    // codePointAt/fromCodePoint (not `ch`, which is only one UTF-16 code
    // unit) and advance by its `.length` so an astral character (e.g. an
    // emoji outside the BMP, stored as a surrogate pair) is captured and
    // skipped over as one whole unit instead of being split in two.
    const cp = String.fromCodePoint(text.codePointAt(i)!);
    push('PUNCT', cp, lineSpan(col, col + cp.length));
    advance(cp.length);
  }

  return { tokens, diagnostics, normalized: text };
}
