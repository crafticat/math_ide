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

const { lex } = mod;

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
  // Supplementary: bracket kinds not otherwise all hit above.
  ['[a]', ['LBRACKET:[', 'WORD:a', 'RBRACKET:]']],
];

for (const [input, expected] of CASES) {
  check('Tokens', `${JSON.stringify(input)} -> ${expected.join(' ')}`, arraysEqual(seqOf(input), expected));
}

// ============================================
// (a) Span integrity: every token's span, sliced out of the NORMALIZED
// source on its own line, reproduces its text - except STRING/MATH_QUOTE
// (span includes the delimiters) and COMMENT (text already includes '//',
// span covers the whole comment). Concatenating (gap + span-slice) across a
// line's tokens, in column order, must reconstruct that normalized line
// exactly, and every gap must be pure whitespace (space/tab) - this also
// proves normalization ran before spans were computed (e.g. '·' shifts
// columns via its ' dot ' expansion) since we reconstruct against
// `normalized`, not the original input.
// ============================================
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
      if (!/^[ \t]*$/.test(gap)) {
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
    if (!/^[ \t]*$/.test(trailingGap)) {
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
// PUNCT fallback: characters covered by none of the rules (e.g. a lone '!'
// that isn't part of '!=') become their own PUNCT token rather than
// vanishing or throwing. Nothing in the spec's rules defines this case;
// PUNCT is the one TokenKind (see types.ts) no other rule produces, so it
// is used here as the designated escape hatch. See report for this note.
// ============================================
check('Fallback', "lone '!' (not followed by '=') lexes as a single PUNCT token", (() => {
  const tok = lex('a ! b').tokens.filter((t) => t.kind !== 'NEWLINE');
  return tok[1] && tok[1].kind === 'PUNCT' && tok[1].text === '!';
})());
check('Fallback', 'lexing unrecognized characters never throws', (() => {
  try { lex('@#%&`?'); return true; } catch { return false; }
})());

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
