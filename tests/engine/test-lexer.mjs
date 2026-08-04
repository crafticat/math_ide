/**
 * MathBrain Engine v2 - Lexer Test Suite
 * Bundles services/engine/lexer.ts with esbuild (via build.mjs) and imports
 * the REAL compiled output, so this proves the esbuild pipeline works
 * end-to-end (not just that the TS source parses).
 * Run with: node tests/engine/test-lexer.mjs
 */

import { existsSync } from 'fs';
import { bundle } from './build.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MathBrain Engine v2 - Lexer Test Suite                      ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;
const failures = [];

function check(group, description, condition) {
  if (condition) {
    passed++;
    console.log(`${GREEN}✓${RESET} [${group}] ${description}`);
  } else {
    failed++;
    failures.push(`[${group}] ${description}`);
    console.log(`${RED}✗${RESET} [${group}] ${description}`);
  }
}

// ============================================
// Bundle + import (proves the esbuild pipeline works)
// ============================================
const modUrl = bundle('services/engine/lexer.ts', 'lexer.mjs');
check('Bundle', `bundle() wrote output under .test-build (${modUrl})`, modUrl.includes('.test-build'));
check('Bundle', 'bundled output file exists on disk', existsSync(new URL(modUrl)));

const mod = await import(modUrl);
check('Bundle', 'bundled ESM module imported successfully', !!mod);
check('Bundle', 'module exports lex()', typeof mod.lex === 'function');
check('Bundle', 'module exports normalizedCol()', typeof mod.normalizedCol === 'function');

const { lex, normalizedCol } = mod;

// ============================================
// Helpers
// ============================================
const seq = (tokens) => tokens.filter((t) => t.kind !== 'NEWLINE').map((t) => `${t.kind}:${t.text}`);
const seqOf = (input) => seq(lex(input).tokens);

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

// ============================================
// Table-driven token sequence cases (NEWLINE filtered out; all single-line)
// ============================================
const CASES = [
  ['a_i^2', ['WORD:a', 'OP:_', 'WORD:i', 'OP:^', 'NUMBER:2']],
  ['x <= y => z', ['WORD:x', 'OP:<=', 'WORD:y', 'OP:=>', 'WORD:z']],
  ['forall eps > 0', ['WORD:forall', 'WORD:eps', 'OP:>', 'NUMBER:0']],
  ['"a | b" when', ['STRING:a | b', 'WORD:when']],
  ['$speed$ = 5', ['MATH_QUOTE:speed', 'OP:=', 'NUMBER:5']],
  ["F'(x)", ['WORD:F', "OP:'", 'LPAREN:(', 'WORD:x', 'RPAREN:)']],
  ['1/(1 + 1/n)', ['NUMBER:1', 'OP:/', 'LPAREN:(', 'NUMBER:1', 'OP:+', 'NUMBER:1', 'OP:/', 'WORD:n', 'RPAREN:)']],
  ['// comment', ['COMMENT:// comment']],
  ['f·g', ['WORD:f', 'WORD:dot', 'WORD:g']],
  ['x >= -1', ['WORD:x', 'OP:>=', 'OP:-', 'NUMBER:1']],
  ['a +- b', ['WORD:a', 'OP:+-', 'WORD:b']],
  ['3.14 + 2', ['NUMBER:3.14', 'OP:+', 'NUMBER:2']],
  ['Math.reals', ['WORD:Math', 'OP:.', 'WORD:reals']],
  ['{ x : y }', ['LBRACE:{', 'WORD:x', 'OP::', 'WORD:y', 'RBRACE:}']],
  ['<=> => -> != <= >=', ['OP:<=>', 'OP:=>', 'OP:->', 'OP:!=', 'OP:<=', 'OP:>=']],
  // Supplementary: rule 1's normalization table has more entries than the
  // mandated cases above exercise ('·' is covered; ≤ ≥ ≠ → and the other two
  // dot/pipe variants are not) - cover them directly for regression safety.
  ['x ≤ y', ['WORD:x', 'OP:<=', 'WORD:y']],
  ['x ≥ y', ['WORD:x', 'OP:>=', 'WORD:y']],
  ['x ≠ y', ['WORD:x', 'OP:!=', 'WORD:y']],
  ['x → y', ['WORD:x', 'OP:->', 'WORD:y']],
  ['a∣b', ['WORD:a', 'OP:|', 'WORD:b']],
  ['a│b', ['WORD:a', 'OP:|', 'WORD:b']],
  ['a∥b', ['WORD:a', 'OP:|', 'WORD:b']],
  ['f•g', ['WORD:f', 'WORD:dot', 'WORD:g']],
  ['f∙g', ['WORD:f', 'WORD:dot', 'WORD:g']],
  // Glued dot product (rule 4's XdotY split): the un-spaced spelling of
  // `f dot g`, and the shapes that must NOT split.
  ['fdotg', ['WORD:f', 'WORD:dot', 'WORD:g']],
  ['xdoty + zdotw', ['WORD:x', 'WORD:dot', 'WORD:y', 'OP:+', 'WORD:z', 'WORD:dot', 'WORD:w']],
  ['Im(fdotg)', ['WORD:Im', 'LPAREN:(', 'WORD:f', 'WORD:dot', 'WORD:g', 'RPAREN:)']],
  ['dot', ['WORD:dot']],
  ['dotted', ['WORD:dotted']],
  ['adotbc', ['WORD:adotbc']],
  ['abdotc', ['WORD:abdotc']],
  ['fdot', ['WORD:fdot']],
  ['f2dotg', ['WORD:f2dotg']],
  // '!' is an operator (postfix factorial); '!=' still wins the longest match.
  ['n!', ['WORD:n', 'OP:!']],
  ['(j-1)! + 1', ['LPAREN:(', 'WORD:j', 'OP:-', 'NUMBER:1', 'RPAREN:)', 'OP:!', 'OP:+', 'NUMBER:1']],
  ['a != b!', ['WORD:a', 'OP:!=', 'WORD:b', 'OP:!']],
  // Supplementary: bracket kinds not otherwise all hit above.
  ['[a]', ['LBRACKET:[', 'WORD:a', 'RBRACKET:]']],
];

for (const [input, expected] of CASES) {
  const actual = seqOf(input);
  const ok = arraysEqual(actual, expected);
  // On failure, show what the lexer actually produced alongside what was
  // expected - "expected X" alone doesn't say how it diverged.
  const label = ok
    ? `${JSON.stringify(input)} -> ${expected.join(' ')}`
    : `${JSON.stringify(input)} -> ${expected.join(' ')} (actual: ${actual.join(' ')})`;
  check('Tokens', label, ok);
}

// ============================================
// (a) Span integrity: every token's span, sliced out of the NORMALIZED
// source on its own line, reproduces its text - except STRING/MATH_QUOTE
// (span includes the delimiters) and COMMENT (text already includes '//',
// span covers the whole comment). Concatenating (gap + span-slice) across a
// line's tokens, in column order, must reconstruct that normalized line
// exactly, and every gap must be pure whitespace (space/tab/CR - CR is
// skipped like whitespace by the lexer, so it never gets its own token)
// - this also proves normalization ran before spans were computed (e.g.
// '·' shifts columns via its ' dot ' expansion) since we reconstruct
// against `normalized`, not the original input.
// ============================================
const WHITESPACE_GAP = /^[ \t\r]*$/;

function checkSpanIntegrity(input, label) {
  const { tokens, normalized } = lex(input);
  const lines = normalized.split('\n');
  const byLine = new Map();
  for (const t of tokens) {
    if (t.kind === 'NEWLINE') continue; // split() already consumed the '\n' itself
    if (!byLine.has(t.span.startLine)) byLine.set(t.span.startLine, []);
    byLine.get(t.span.startLine).push(t);
  }

  let ok = true;
  const problems = [];

  for (const [lineNo, lineTokens] of byLine) {
    const lineStr = lines[lineNo - 1];
    lineTokens.sort((a, b) => a.span.startCol - b.span.startCol);
    let cursor = 0;
    let rebuilt = '';
    for (const t of lineTokens) {
      const gap = lineStr.slice(cursor, t.span.startCol);
      if (!WHITESPACE_GAP.test(gap)) {
        ok = false;
        problems.push(`non-whitespace gap ${JSON.stringify(gap)} before ${t.kind}:${t.text} on line ${lineNo}`);
      }
      const slice = lineStr.slice(t.span.startCol, t.span.endCol);
      let expectedSlices;
      if (t.kind === 'STRING') expectedSlices = [`"${t.text}"`, `"${t.text}`];
      else if (t.kind === 'MATH_QUOTE') expectedSlices = [`$${t.text}$`, `$${t.text}`];
      else expectedSlices = [t.text];
      if (!expectedSlices.includes(slice)) {
        ok = false;
        problems.push(`span slice ${JSON.stringify(slice)} not in ${JSON.stringify(expectedSlices)} for ${t.kind}:${t.text} on line ${lineNo}`);
      }
      rebuilt += gap + slice;
      cursor = t.span.endCol;
    }
    const trailingGap = lineStr.slice(cursor);
    if (!WHITESPACE_GAP.test(trailingGap)) {
      ok = false;
      problems.push(`non-whitespace trailing gap ${JSON.stringify(trailingGap)} on line ${lineNo}`);
    }
    rebuilt += trailingGap;
    if (rebuilt !== lineStr) {
      ok = false;
      problems.push(`reconstructed ${JSON.stringify(rebuilt)} != line ${JSON.stringify(lineStr)}`);
    }
  }

  check('SpanIntegrity', `${label || JSON.stringify(input)}${problems.length ? ' -- ' + problems.join('; ') : ''}`, ok);
}

for (const [input] of CASES) checkSpanIntegrity(input);
checkSpanIntegrity('x = 1\ny = 2', 'multi-line input reconstructs each line');
checkSpanIntegrity('"abc', 'unterminated string reconstructs to EOL');
checkSpanIntegrity('$abc', 'unterminated math-quote reconstructs to EOL');
// PUNCT fallback cases (see Fallback section below) also carry real spans.
checkSpanIntegrity('a ! b', 'lone "!" (postfix factorial OP) reconstructs');
checkSpanIntegrity('@#%&`?', 'PUNCT fallback (run of unrecognized symbols) reconstructs');
// CRLF: '\r' is skipped like whitespace, so it must show up as part of the
// (whitespace-only) gap rather than breaking reconstruction.
checkSpanIntegrity('x = 1\r\ny = 2', 'CRLF line ending reconstructs on both lines');
// Astral safety: '😀' is a surrogate pair (2 UTF-16 code units); its PUNCT
// span must cover both units without splitting the pair.
checkSpanIntegrity('a😀b', 'astral character (emoji) span reconstructs without splitting the surrogate pair');

// ============================================
// (b) Unterminated string: exactly 1 diagnostic, severity 'warn', STRING runs to EOL
// ============================================
{
  const { tokens, diagnostics } = lex('"abc');
  const content = tokens.filter((t) => t.kind !== 'NEWLINE');
  check('Unterminated', '"abc -> exactly one token, kind STRING', content.length === 1 && content[0].kind === 'STRING');
  check('Unterminated', '"abc -> STRING text is "abc" with no quote', !!content[0] && content[0].text === 'abc');
  check('Unterminated', '"abc -> exactly one diagnostic', diagnostics.length === 1);
  check('Unterminated', '"abc -> diagnostic severity is warn', !!diagnostics[0] && diagnostics[0].severity === 'warn');
  check('Unterminated', '"abc -> diagnostic message matches spec exactly', !!diagnostics[0] && diagnostics[0].message === 'unterminated quote — treated as text');
}

// ============================================
// (c) Unterminated math-quote: exactly 1 diagnostic, severity 'warn', MATH_QUOTE runs to EOL
// ============================================
{
  const { tokens, diagnostics } = lex('$abc');
  const content = tokens.filter((t) => t.kind !== 'NEWLINE');
  check('Unterminated', '$abc -> exactly one token, kind MATH_QUOTE', content.length === 1 && content[0].kind === 'MATH_QUOTE');
  check('Unterminated', '$abc -> MATH_QUOTE text is "abc" with no $', !!content[0] && content[0].text === 'abc');
  check('Unterminated', '$abc -> exactly one diagnostic', diagnostics.length === 1);
  check('Unterminated', '$abc -> diagnostic severity is warn', !!diagnostics[0] && diagnostics[0].severity === 'warn');
  check('Unterminated', '$abc -> diagnostic message matches spec exactly', !!diagnostics[0] && diagnostics[0].message === 'unterminated $ — treated as math');
}

// ============================================
// (d) Two-line input: exactly one NEWLINE token between the lines, correct
// startLine on tokens on each side
// ============================================
{
  const { tokens } = lex('x = 1\ny = 2');
  const newlines = tokens.filter((t) => t.kind === 'NEWLINE');
  check('Lines', 'x = 1\\ny = 2 -> exactly one NEWLINE token', newlines.length === 1);

  const idx = tokens.indexOf(newlines[0]);
  const before = tokens.slice(0, idx);
  const after = tokens.slice(idx + 1);
  check('Lines', 'all tokens before the NEWLINE have startLine/endLine 1', before.length > 0 && before.every((t) => t.span.startLine === 1 && t.span.endLine === 1));
  check('Lines', 'all tokens after the NEWLINE have startLine/endLine 2', after.length > 0 && after.every((t) => t.span.startLine === 2 && t.span.endLine === 2));
  check('Lines', 'line 1 tokens are WORD:x OP:= NUMBER:1', arraysEqual(seq(before), ['WORD:x', 'OP:=', 'NUMBER:1']));
  check('Lines', 'line 2 tokens are WORD:y OP:= NUMBER:2', arraysEqual(seq(after), ['WORD:y', 'OP:=', 'NUMBER:2']));
  check('Lines', 'the NEWLINE token itself spans the line it ends (line 1)', newlines[0].span.startLine === 1 && newlines[0].span.endLine === 1);
}

// Extra: three-line input keeps NEWLINE count and per-line numbering consistent
{
  const { tokens } = lex('a\nb\nc');
  const newlines = tokens.filter((t) => t.kind === 'NEWLINE');
  check('Lines', 'a\\nb\\nc -> exactly two NEWLINE tokens', newlines.length === 2);
  const words = tokens.filter((t) => t.kind === 'WORD');
  check('Lines', 'a\\nb\\nc -> WORD tokens have startLine 1, 2, 3 respectively', arraysEqual(words.map((t) => t.span.startLine), [1, 2, 3]));
}

// ============================================
// normalized field: identity when no special unicode chars present; applies substitutions otherwise
// ============================================
check('Normalized', 'plain ascii input round-trips through .normalized unchanged', lex('x <= y').normalized === 'x <= y');
check('Normalized', "'f·g'.normalized === 'f dot g'", lex('f·g').normalized === 'f dot g');
check('Normalized', "'a∣b'.normalized === 'a|b'", lex('a∣b').normalized === 'a|b');
check('Normalized', "'x ≤ y'.normalized === 'x <= y'", lex('x ≤ y').normalized === 'x <= y');

// ============================================
// normalizedCol: maps a caret's RAW column onto the NORMALIZED column its
// span was measured against (engine.ts's nodeAt() is the only caller, for
// mapping an editor caret before span lookup - see Task "raw->normalized
// column mapping"). Every check below is gated on hasNormalizedCol
// (short-circuit &&, not a throwing call) so a pre-fix bundle that doesn't
// export it yet fails loudly here instead of throwing and aborting the rest
// of this suite.
// ============================================
const hasNormalizedCol = typeof normalizedCol === 'function';

check('normalizedCol', 'ascii text, interior column: identity',
  hasNormalizedCol && normalizedCol('a = b + c', 4) === 4);
check('normalizedCol', 'ascii text, column 0: identity',
  hasNormalizedCol && normalizedCol('a = b', 0) === 0);
check('normalizedCol', 'ascii text, column === length: identity',
  hasNormalizedCol && normalizedCol('a = b', 5) === 5);

// '·' (one raw char) expands to ' dot ' (five normalized chars, i.e. +4) -
// so a raw column AFTER it must shift by 4, while one AT OR BEFORE it does
// not shift at all. Expected values are self-computed against the real
// lex() output (indexOf on the normalized string), not hand-counted magic
// numbers, matching this suite's convention throughout.
const DOT_SRC = 'y = 2·x^2 + 1';
const dotNormalized = lex(DOT_SRC).normalized;
check('normalizedCol', 'sanity: DOT_SRC normalizes to the expected 4-column-longer string',
  dotNormalized === 'y = 2 dot x^2 + 1' && dotNormalized.length === DOT_SRC.length + 4);
check('normalizedCol', 'raw column BEFORE the · is unshifted',
  hasNormalizedCol && normalizedCol(DOT_SRC, DOT_SRC.indexOf('2')) === dotNormalized.indexOf('2'));
check('normalizedCol', 'raw column AT the · itself maps to the start of its " dot " expansion',
  hasNormalizedCol && normalizedCol(DOT_SRC, DOT_SRC.indexOf('·')) === dotNormalized.indexOf(' dot '));
check('normalizedCol', 'raw column AFTER the · (the exponent digit) shifts by +4',
  hasNormalizedCol && normalizedCol(DOT_SRC, DOT_SRC.indexOf('x^2') + 2) === dotNormalized.indexOf('x^2') + 2);
check('normalizedCol', 'raw column at end-of-line maps to normalized end-of-line',
  hasNormalizedCol && normalizedCol(DOT_SRC, DOT_SRC.length) === dotNormalized.length);

// The two early-return branches are DELIBERATELY not clamped: engine.ts's
// nodeAt() relies on an out-of-range raw column staying equally out-of-range
// after mapping (so a caret that misses every span still misses after the
// map) - clamping would silently pull an invalid caret onto a valid one.
check('normalizedCol', 'negative column is returned UNCLAMPED (not pulled to 0)',
  hasNormalizedCol && normalizedCol('a = b', -3) === -3);
check('normalizedCol', 'past-end column is returned UNCLAMPED, preserving the overshoot',
  hasNormalizedCol && normalizedCol('a = b', 5 + 7) === 'a = b'.length + 7);
check('normalizedCol', 'past-end overshoot is preserved even across a normalization-lengthening line',
  hasNormalizedCol && normalizedCol(DOT_SRC, DOT_SRC.length + 7) === dotNormalized.length + 7);

// ============================================
// PUNCT fallback: characters covered by none of the rules (e.g. '@' or '#')
// become their own PUNCT token rather than vanishing or throwing. Nothing in
// the spec's rules defines this case; PUNCT is the one TokenKind (see
// types.ts) no other rule produces, so it is used here as the designated
// escape hatch. See report for this note.
// ============================================
check('Fallback', "'@' (in no rule at all) lexes as a single PUNCT token", (() => {
  const tok = lex('a @ b').tokens.filter((t) => t.kind !== 'NEWLINE');
  return tok[1] && tok[1].kind === 'PUNCT' && tok[1].text === '@';
})());
// '!' is NOT a fallback character: it is the postfix factorial operator, and
// the two-char class still claims it when it opens '!='.
check('Fallback', "lone '!' (not followed by '=') lexes as OP, not PUNCT", (() => {
  const tok = lex('a ! b').tokens.filter((t) => t.kind !== 'NEWLINE');
  return tok[1] && tok[1].kind === 'OP' && tok[1].text === '!';
})());
check('Fallback', 'lexing unrecognized characters never throws', (() => {
  try { lex('@#%&`?'); return true; } catch { return false; }
})());

// ============================================
// CRLF: '\r' is treated as whitespace (like space/tab), so a CRLF line
// ending produces no stray PUNCT token for the '\r' itself.
// ============================================
check('CRLF', "'x = 1\\r\\ny = 2' has no PUNCT token (the \\r is skipped, not fallen-through)", !lex('x = 1\r\ny = 2').tokens.some((t) => t.kind === 'PUNCT'));
check('CRLF', "'x = 1\\r\\ny = 2' token sequence matches the CRLF-free equivalent", arraysEqual(seqOf('x = 1\r\ny = 2'), seqOf('x = 1\ny = 2')));

// ============================================
// Astral safety: a character outside the BMP (e.g. an emoji) is stored as
// a surrogate pair (2 UTF-16 code units). The PUNCT fallback must read and
// advance over the whole code point, not one half of the pair.
// ============================================
check('Astral', "'😀' alone lexes as a single PUNCT token holding the full emoji, not half a surrogate pair", (() => {
  const tok = lex('😀').tokens.filter((t) => t.kind !== 'NEWLINE');
  return tok.length === 1 && tok[0].kind === 'PUNCT' && tok[0].text === '😀';
})());
check('Astral', "'a😀b' -> WORD PUNCT WORD (the emoji does not merge with or truncate its neighbors)", arraysEqual(seqOf('a😀b'), ['WORD:a', 'PUNCT:😀', 'WORD:b']));

// ============================================
// Fuzz: a seeded, deterministic PRNG (mulberry32 - NOT Math.random, so
// runs are reproducible) drives 300 random strings over a small alphabet
// spanning letters/digits/quotes/newline/CR/unicode-normalization
// triggers/operators/brackets/an astral emoji. For each: lex() must not
// throw, and its spans must reconstruct (checkSpanIntegrity, reused as-is)
// - which, via that helper's whitespace-only-gap rule, is exactly the
// guarantee that every non-whitespace character ends up under some token's
// span.
// ============================================
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FUZZ_ALPHABET = ['a', 'x', 'Z', '1', '9', '"', '$', '\n', '\r', '·', '≤', '<', '=', '>', '+', '-', '_', '^', '|', '(', ')', '{', '}', ' ', '!', '😀'];
const rng = mulberry32(1234);
for (let n = 0; n < 300; n++) {
  const len = Math.floor(rng() * 41); // 0..40
  let s = '';
  for (let k = 0; k < len; k++) s += FUZZ_ALPHABET[Math.floor(rng() * FUZZ_ALPHABET.length)];
  let threw = false;
  try { lex(s); } catch { threw = true; }
  check('Fuzz', `seed 1234 case #${n} ${JSON.stringify(s)} -> lex() does not throw`, !threw);
  if (!threw) checkSpanIntegrity(s, `seed 1234 case #${n} ${JSON.stringify(s)} -> spans reconstruct (full non-whitespace coverage)`);
}

// ============================================
// Summary
// ============================================
console.log('\n' + '═'.repeat(50));
console.log(`Total: ${passed}/${passed + failed} checks passed`);

if (failed > 0) {
  console.log(`\n${RED}${failed} FAILED:${RESET}\n`);
  failures.forEach((f) => console.log(`  ${f}`));
  console.log('');
} else {
  console.log(`\n${GREEN}✓ All checks passed!${RESET}\n`);
}

process.exit(failed > 0 ? 1 : 0);
