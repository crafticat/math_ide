/**
 * MathBrain Engine v2 - Disambiguator Test Suite
 *
 * Bundles services/engine/disambiguate.ts (which pulls in language.ts) and
 * services/engine/lexer.ts, then runs the REAL pipeline for every case:
 * lex(line) -> filter NEWLINE/COMMENT -> segment().
 *
 * The product claim under test: "words near words are English, letters near
 * numbers are math". Every case below is a sentence a user would actually
 * type; the expectations are the reading a human gives it.
 *
 * Run with: node tests/engine/test-disambiguate.mjs
 */

import { existsSync } from 'fs';
import { bundle } from './build.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MathBrain Engine v2 - Disambiguator Test Suite               ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;
const failures = [];

function check(group, description, condition, detail) {
  if (condition) {
    passed++;
    console.log(`${GREEN}✓${RESET} [${group}] ${description}`);
  } else {
    failed++;
    failures.push(`[${group}] ${description}${detail ? `\n      ${detail}` : ''}`);
    console.log(`${RED}✗${RESET} [${group}] ${description}`);
    if (detail) console.log(`      ${detail}`);
  }
}

// ============================================
// Bundle + import
// ============================================
const lexerUrl = bundle('services/engine/lexer.ts', 'lexer-for-disambiguate.mjs');
const disambiguateUrl = bundle('services/engine/disambiguate.ts', 'disambiguate.mjs');
check('Bundle', `disambiguator bundle wrote output under .test-build (${disambiguateUrl})`, disambiguateUrl.includes('.test-build'));
check('Bundle', 'disambiguator bundled output file exists on disk', existsSync(new URL(disambiguateUrl)));

const { lex } = await import(lexerUrl);
const { segment, WEIGHTS } = await import(disambiguateUrl);
check('Bundle', 'module exports segment()', typeof segment === 'function');
check('Bundle', 'module exports a single flat WEIGHTS table of numbers',
  !!WEIGHTS && typeof WEIGHTS === 'object' && Object.keys(WEIGHTS).length > 0 &&
  Object.values(WEIGHTS).every((v) => typeof v === 'number'), JSON.stringify(WEIGHTS));

// Quality review #4: fire()'s sign formatting is `weight >= 0 ? '+' : ''` -
// mirrored here so a regression back to `weight > 0` is caught even though no
// CURRENT WEIGHTS entry is 0. `feature(0)` (no sign) would fail the
// checkInvariants reason regex below; `feature(+0)` passes it.
{
  const REASON_RE = /^([a-zA-Z]+)(?:-(?:left|right))?\(([+-]\d+)\)$/;
  const fireFormat = (weight) => `probe(${weight >= 0 ? '+' : ''}${weight})`;
  check('Weights', 'a zero-weight reason renders as "probe(+0)" and the invariant regex accepts it',
    fireFormat(0) === 'probe(+0)' && REASON_RE.test(fireFormat(0)), fireFormat(0));
}

// ============================================
// Helpers
// ============================================

// One statement: lex, drop NEWLINE/COMMENT (document.ts hands the
// disambiguator a newline-free, comment-free token list), segment.
function run(source) {
  const { tokens: all, diagnostics: lexDiagnostics } = lex(source);
  const tokens = all.filter((t) => t.kind !== 'NEWLINE' && t.kind !== 'COMMENT');
  const diagnostics = [];
  const { runs, explain } = segment(tokens, diagnostics);
  return { tokens, runs, explain, diagnostics, lexDiagnostics };
}

const kindsOf = (runs) => runs.map((r) => r.kind);
const textOf = (run) => run.tokens.map((t) => t.text).join(' ');

// Invariants that must hold for EVERY input, no exceptions:
//  - the runs partition the input (same token objects, same order, nothing
//    added, nothing dropped)
//  - no empty runs, and runs are maximal (no two adjacent runs share a kind)
//  - every WORD token has exactly one DecisionRecord, in token order
//  - a WORD's record verdict agrees with the kind of the run it landed in
function checkInvariants(group, label, { tokens, runs, explain }) {
  const flat = runs.flatMap((r) => r.tokens);
  check(group, `${label} - runs partition the input token stream`,
    flat.length === tokens.length && flat.every((t, i) => t === tokens[i]),
    `${flat.length} run tokens vs ${tokens.length} input tokens`);
  check(group, `${label} - runs are non-empty, maximal, and well-kinded`,
    runs.every((r) => r.tokens.length > 0) &&
    runs.every((r) => r.kind === 'prose' || r.kind === 'math') &&
    runs.every((r, i) => i === 0 || runs[i - 1].kind !== r.kind),
    kindsOf(runs).join(' '));

  const words = tokens.filter((t) => t.kind === 'WORD');
  check(group, `${label} - one DecisionRecord per WORD, in order`,
    explain.length === words.length && explain.every((r, i) => r.word === words[i].text && r.span === words[i].span),
    `${explain.length} records vs ${words.length} words: ${explain.map((r) => r.word).join(' ')} / ${words.map((t) => t.text).join(' ')}`);
  check(group, `${label} - every record is well-formed (verdict/score/reasons/span)`,
    explain.every((r) => (r.verdict === 'prose' || r.verdict === 'math') && typeof r.score === 'number' &&
      Array.isArray(r.reasons) && r.reasons.length > 0 && r.span && typeof r.span.startCol === 'number'),
    JSON.stringify(explain.map((r) => [r.word, r.verdict, r.score, r.reasons])));

  // record verdict <-> run kind agreement
  const kindByToken = new Map();
  for (const r of runs) for (const t of r.tokens) kindByToken.set(t, r.kind);
  const mismatches = [];
  let w = 0;
  for (const t of tokens) {
    if (t.kind !== 'WORD') continue;
    const rec = explain[w++];
    if (rec && kindByToken.get(t) !== rec.verdict) mismatches.push(`${t.text}: record=${rec.verdict} run=${kindByToken.get(t)}`);
  }
  check(group, `${label} - record verdicts agree with run kinds`, mismatches.length === 0, mismatches.join(' | '));

  // every scored reason names a real WEIGHTS feature and quotes its weight
  const bad = [];
  for (const rec of explain) {
    for (const reason of rec.reasons) {
      if (/^(absolute|parenthetical|default):/.test(reason)) continue;
      const m = /^([a-zA-Z]+)(?:-(?:left|right))?\(([+-]\d+)\)$/.exec(reason);
      if (!m) { bad.push(`malformed reason "${reason}"`); continue; }
      if (!(m[1] in WEIGHTS)) { bad.push(`unknown feature "${m[1]}"`); continue; }
      if (WEIGHTS[m[1]] !== Number(m[2])) bad.push(`"${reason}" != WEIGHTS.${m[1]}=${WEIGHTS[m[1]]}`);
    }
  }
  check(group, `${label} - every reason maps to a WEIGHTS entry with its exact weight`, bad.length === 0, bad.join(' | '));
}

// ============================================
// The classification table (the product spec, as cases)
// ============================================
// An object expectation asserts "every occurrence of this word has this
// verdict"; an array expectation asserts the FULL ordered verdict sequence
// (needed when the same word gets two different readings in one sentence).
const CASES = [
  ['Let a and b be real numbers suchthat a^2 + b^2 = 1',
    { Let: 'prose', a: 'math', and: 'prose', b: 'math', be: 'prose', real: 'prose', numbers: 'prose', suchthat: 'math' }],
  ['We use the sum and product rules',
    { We: 'prose', sum: 'prose', and: 'prose', product: 'prose', rules: 'prose' }],
  ['x in A and y in B => x + y in A union B',
    { x: 'math', in: 'math', A: 'math', and: 'math', y: 'math', union: 'math' }],
  ['p and q => r or not s',
    { p: 'math', and: 'math', q: 'math', or: 'math', not: 'math', s: 'math' }],
  ['The sequence a_n converges to L and the limit is unique',
    { The: 'prose', sequence: 'prose', a: 'math', converges: 'prose', L: 'math', and: 'prose', limit: 'prose', unique: 'prose' }],
  ['Show that f and g are continuous on [0,1]',
    { Show: 'prose', that: 'prose', f: 'math', and: 'prose', g: 'math', are: 'prose', continuous: 'prose' }],
  ['We use the sum(k=0 -> n) identity',
    { sum: 'math', identity: 'prose' }],
  ['forall eps > 0 exists delta > 0',
    { forall: 'math', eps: 'math', exists: 'math', delta: 'math' }],
  ['Assume x is included in the set',
    { Assume: 'prose', x: 'math', is: 'prose', included: 'prose', in: 'prose', the: 'prose', set: 'prose' }],
  ['a divides b',
    { a: 'math', divides: 'prose', b: 'math' }],
  ['This is a big number',
    { This: 'prose', is: 'prose', a: 'prose', big: 'prose', number: 'prose' }],
  // Per-OCCURRENCE: the first `a` (bound by `Let`) is a variable, the second
  // (`a real number`) is the English article - one map cannot say both.
  ['Let a be a real number',
    [['Let', 'prose'], ['a', 'math'], ['be', 'prose'], ['a', 'prose'], ['real', 'prose'], ['number', 'prose']]],

  // Fix A: a statement-INITIAL discourse marker (then/so/hence/thus/therefore/
  // assume/suppose/note/recall/consider/clearly/since/because) must not poison
  // hasProse for the WHOLE sentence - only the marker itself reads as prose,
  // not everything after it.
  ['Then p and q => r or not s',
    { Then: 'prose', p: 'math', and: 'math', q: 'math', r: 'math', or: 'math', not: 'math', s: 'math' }],
  ['Assume x in A and y in B => x + y in A union B',
    { Assume: 'prose', x: 'math', in: 'math', A: 'math', and: 'math', y: 'math', union: 'math' }],
  // ...but the marker is not a magic escape hatch: if the REST of the
  // sentence still reads as English, and/or/not stay prose.
  ['Hence a and b are nonzero',
    { Hence: 'prose', a: 'math', and: 'prose', b: 'math', are: 'prose', nonzero: 'prose' }],

  // Fix B: the articleA veto used to fire for ANY binder ("Suppose a
  // sequence" wrongly read `a` as a variable just because a binder came
  // before it). It now only vetoes when the word AFTER `a` is an
  // auxiliary/copula verb ("Let a be...") - a plain noun after a binder is
  // still the English article, binder or not.
  ['Suppose a sequence converges', { Suppose: 'prose', a: 'prose', sequence: 'prose', converges: 'prose' }],
  ['Find a real number x', { Find: 'prose', a: 'prose', real: 'prose', number: 'prose', x: 'math' }],
  ['Show a counterexample', { Show: 'prose', a: 'prose', counterexample: 'prose' }],

  // Fix C (quality review #1): two divergent definitions of "call" used to
  // exist - a prime between a WORD and its `(` (`F'(area)`) was recognized by
  // absoluteOf (which scans FORWARD from the word, through primes) but not by
  // buildContext's stack (which only checked ONE token back from the paren,
  // landing on the prime instead of the word) - so the call's own argument
  // fell back to ordinary scoring (`area` -> unknownMultiChar -> prose) and
  // shattered the run. Both now read one shared call-paren set.
  ["F'(area) = 1", { F: 'math', area: 'math' }],
  ["F''(x) = 0", { F: 'math', x: 'math' }],

  // Fix D (quality review #2): a single-LETTER call absolute now requires
  // SPAN adjacency all the way to the paren - a space before `(` means an
  // English sentence hit a parenthetical remark, not a call. FUNCTIONS names
  // stay lenient about spacing (unaffected: `choose(n, k)` below).
  ['We have a (possibly empty) set',
    { We: 'prose', have: 'prose', a: 'prose', possibly: 'prose', empty: 'prose', set: 'prose' }],
  ['Choose a (rational) number', { Choose: 'prose', a: 'prose', rational: 'prose', number: 'prose' }],
  ['a(n) = n^2', { a: 'math', n: 'math' }],

  // Fix E (quality review #7): choose/show/find/note double as common
  // English verbs - bare (no parens) they must not get the bareKeyword math
  // bonus. `choose` in real call form is unaffected.
  ['we choose x in A', { we: 'prose', choose: 'prose', x: 'math', in: 'math', A: 'math' }],
  ['choose(n, k) = 10', { choose: 'math', n: 'math', k: 'math' }],
];

const results = new Map();

for (const [src, expectation] of CASES) {
  const result = run(src);
  results.set(src, result);
  const label = JSON.stringify(src);

  if (Array.isArray(expectation)) {
    const got = result.explain.map((r) => [r.word, r.verdict]);
    const ok = got.length === expectation.length && got.every(([w, v], i) => w === expectation[i][0] && v === expectation[i][1]);
    check('Verdicts', `${label} - ordered per-occurrence verdicts`, ok,
      `expected ${expectation.map((e) => e.join(':')).join(' ')}\n      got      ${got.map((e) => e.join(':')).join(' ')}`);
  } else {
    for (const [word, want] of Object.entries(expectation)) {
      const recs = result.explain.filter((r) => r.word === word);
      const ok = recs.length > 0 && recs.every((r) => r.verdict === want);
      check('Verdicts', `${label} - ${word} -> ${want}`, ok,
        recs.length === 0 ? 'no DecisionRecord for that word'
          : recs.map((r) => `${r.verdict} (score ${r.score}: ${r.reasons.join(', ')})`).join(' | '));
    }
  }

  checkInvariants('Invariants', label, result);
}

// ============================================
// Run assembly
// ============================================
{
  const src = 'Let a and b be real numbers suchthat a^2 + b^2 = 1';
  const { runs } = results.get(src);
  check('Runs', `${JSON.stringify(src)} - exact run-kind sequence`,
    kindsOf(runs).join(' ') === 'prose math prose math prose math',
    runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
  check('Runs', `${JSON.stringify(src)} - run contents split the sentence at the right words`,
    runs.map((r) => textOf(r)).join(' | ') === 'Let | a | and | b | be real numbers | suchthat a ^ 2 + b ^ 2 = 1',
    runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}

// A pure-English sentence is ONE prose run; a pure-formula statement is ONE math run.
for (const [src, wantKinds] of [
  ['We use the sum and product rules', 'prose'],
  ['This is a big number', 'prose'],
  ['x in A and y in B => x + y in A union B', 'math'],
  ['p and q => r or not s', 'math'],
  ['forall eps > 0 exists delta > 0', 'math'],
]) {
  const { runs } = results.get(src);
  check('Runs', `${JSON.stringify(src)} - collapses to a single ${wantKinds} run`,
    runs.length === 1 && runs[0].kind === wantKinds, kindsOf(runs).join(' '));
}
{
  const { runs } = results.get('a divides b');
  check('Runs', '"a divides b" - splits math/prose/math', kindsOf(runs).join(' ') === 'math prose math', kindsOf(runs).join(' '));
}
{
  const { runs } = results.get('Show that f and g are continuous on [0,1]');
  check('Runs', '"Show that f and g are continuous on [0,1]" - trailing interval is its own math run',
    kindsOf(runs).join(' ') === 'prose math prose math prose math' && textOf(runs[runs.length - 1]) === '[ 0 , 1 ]',
    runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}
{
  // Fix A at the run level: the statement-initial discourse marker "Then" is
  // its own prose run, and everything after it collapses into ONE math run -
  // the marker must not shatter the formula into alternating prose/math.
  const { runs } = results.get('Then p and q => r or not s');
  check('Runs', '"Then p and q => r or not s" - prose opener, then a single math run (discourse marker does not poison the sentence frame)',
    kindsOf(runs).join(' ') === 'prose math' && textOf(runs[1]) === 'p and q => r or not s',
    runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}
{
  // Fix C at the run level (quality review #1): a prime between the word and
  // its paren must not shatter the call's own argument back into prose.
  const { runs } = results.get("F'(area) = 1");
  check('Runs', "\"F'(area) = 1\" - a prime before the paren does not shatter the call (single math run)",
    runs.length === 1 && runs[0].kind === 'math', runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}
{
  const { runs } = results.get("F''(x) = 0");
  check('Runs', "\"F''(x) = 0\" - two primes before the paren, still one math run",
    runs.length === 1 && runs[0].kind === 'math', runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}
{
  // Fix D at the run level (quality review #2): a non-adjacent paren after a
  // single letter is a parenthetical remark, not a call - the whole sentence
  // (including the letter) collapses to one clean prose run.
  const { runs } = results.get('We have a (possibly empty) set');
  check('Runs', '"We have a (possibly empty) set" - a space before `(` means a parenthetical remark, not a call (single prose run)',
    runs.length === 1 && runs[0].kind === 'prose', runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}
{
  const { runs } = results.get('Choose a (rational) number');
  check('Runs', '"Choose a (rational) number" - collapses to a single prose run',
    runs.length === 1 && runs[0].kind === 'prose', runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}
{
  const { runs } = results.get('a(n) = n^2');
  check('Runs', '"a(n) = n^2" - a paren directly adjacent to a single letter is still a real call (single math run)',
    runs.length === 1 && runs[0].kind === 'math', runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}
{
  // Fix E at the run level (quality review #7): bare "choose" joins the prose
  // lead-in instead of splitting off into its own math island.
  const { runs } = results.get('we choose x in A');
  check('Runs', '"we choose x in A" - bare "choose" reads as prose, joining the lead-in instead of splitting the formula',
    kindsOf(runs).join(' ') === 'prose math' && textOf(runs[0]) === 'we choose' && textOf(runs[1]) === 'x in A',
    runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}
{
  const { runs } = results.get('choose(n, k) = 10');
  check('Runs', '"choose(n, k) = 10" - real call form is unaffected by the bareKeyword carve-out (single math run)',
    runs.length === 1 && runs[0].kind === 'math', runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}

// Punctuation attachment: a comma between two prose words stays in the prose
// run; a comma between numbers stays math; a trailing period follows its
// sentence.
{
  const { runs } = run('Assume x is continuous, bounded, and monotone.');
  check('Punctuation', 'commas + trailing period between prose words stay prose',
    runs.filter((r) => r.kind === 'prose').some((r) => r.tokens.some((t) => t.text === ',')) &&
    runs[runs.length - 1].kind === 'prose',
    runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}
{
  const { runs } = run('f(1, 2) = 3');
  check('Punctuation', 'comma inside a call stays math (single math run)', runs.length === 1 && runs[0].kind === 'math',
    runs.map((r) => `[${r.kind} ${textOf(r)}]`).join(''));
}

// Parenthetical remark: prose ( prose ) prose -> the whole parenthetical is prose.
{
  const r = run('The function is continuous (see above)');
  check('Parens', 'a parenthetical remark between prose is one prose run',
    r.runs.length === 1 && r.runs[0].kind === 'prose', r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
  checkInvariants('Invariants', '"The function is continuous (see above)"', r);
}
{
  const r = run('Show that sin(x) is bounded');
  check('Parens', 'a function call after prose stays math', kindsOf(r.runs).join(' ') === 'prose math prose',
    r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
}
{
  // Arguments of a call are math even when the argument word is unknown.
  const r = run('sqrt(area) + 1');
  check('Parens', 'call arguments are math even for unknown words', r.runs.length === 1 && r.runs[0].kind === 'math',
    r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
}

// Quoted text and quoted math keep their forced reading.
{
  const r = run('Let x = 1 "by assumption"');
  const last = r.runs[r.runs.length - 1];
  check('Quotes', 'a trailing STRING becomes its own prose run',
    kindsOf(r.runs).join(' ') === 'prose math prose' && last.tokens.length === 1 && last.tokens[0].kind === 'STRING',
    r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
}
{
  const r = run('We know $x^2$ is positive');
  check('Quotes', 'a MATH_QUOTE inside prose is its own math run',
    kindsOf(r.runs).join(' ') === 'prose math prose', r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
}
{
  // Quality review #3: attachPunctuation's doc comment used to claim
  // `x = "by parts"` "stays inside the math run as a Text atom" - but with
  // nothing after the STRING, it has no right neighbour to satisfy that test
  // and actually becomes its own trailing prose run (see the test above).
  // This is the comment's REPLACEMENT example: a STRING with math on BOTH
  // sides genuinely does stay inside a single math run.
  const r = run('x = "by parts" + 1');
  check('Quotes', 'a STRING between two math tokens stays inside the math run',
    r.runs.length === 1 && r.runs[0].kind === 'math', r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
}
{
  const r = run('The claim p AND q holds');
  const and = r.explain.find((x) => x.word === 'AND');
  check('Quotes', 'uppercase AND forces logic even inside an English sentence',
    !!and && and.verdict === 'math', JSON.stringify(r.explain.map((x) => [x.word, x.verdict])));
  checkInvariants('Invariants', '"The claim p AND q holds"', r);
}

// Math.* members and sub/superscript operands never get torn out of a formula.
{
  const r = run('Let x in Math.reals');
  check('Extra', '"Let x in Math.reals" - Math.reals stays math', r.explain.find((x) => x.word === 'reals').verdict === 'math' &&
    r.explain.find((x) => x.word === 'in').verdict === 'math',
    JSON.stringify(r.explain.map((x) => [x.word, x.verdict])));
}
{
  const r = run('x_max + x1 = 2');
  check('Extra', '"x_max + x1 = 2" - subscript word and indexed variable stay math',
    r.runs.length === 1 && r.runs[0].kind === 'math', r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
}

// ============================================
// Regressions found by running the app's own INITIAL_CONTENT through segment()
// ============================================
{
  const r = run('Let f be continuous on [a, b]');
  check('Document', '"[a, b]" stays one math run (a comma inside brackets is not an Oxford comma)',
    kindsOf(r.runs).join(' ') === 'prose math prose math' && textOf(r.runs[3]) === '[ a , b ]',
    r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
  checkInvariants('Invariants', '"Let f be continuous on [a, b]"', r);
}
{
  const r = run("Then F'(x) = f(x) forall x in (a, b)");
  check('Document', '"x in (a, b)" - membership in an interval is math even after a prose lead-in',
    kindsOf(r.runs).join(' ') === 'prose math' && r.explain.find((x) => x.word === 'in').verdict === 'math',
    r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
  checkInvariants('Invariants', '"Then F\'(x) = f(x) forall x in (a, b)"', r);
}
{
  const r = run('A function f is continuous at a point c if');
  const got = r.explain.map((x) => [x.word, x.verdict]);
  const want = [['A', 'prose'], ['function', 'prose'], ['f', 'math'], ['is', 'prose'], ['continuous', 'prose'],
    ['at', 'prose'], ['a', 'prose'], ['point', 'prose'], ['c', 'math'], ['if', 'prose']];
  check('Document', '"A function f is continuous at a point c if" - articles stay English, letters stay math',
    JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
  checkInvariants('Invariants', '"A function f is continuous at a point c if"', r);
}
{
  // The parser reads `cases { v if c; v2 otherwise }` as one expression, so the
  // environment body must not be split on its English-looking keywords.
  const r = run('f(x) = cases { x^2 if x > 0; 0 otherwise }');
  check('Document', 'a cases{} body stays one math run (if/otherwise included)',
    r.runs.length === 1 && r.runs[0].kind === 'math', r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
  checkInvariants('Invariants', '"f(x) = cases { ... }"', r);
}
{
  const r = run('forall n in N and forall a, b in R');
  check('Document', '"forall n in N and forall a, b in R" - a pure quantifier line is one math run',
    r.runs.length === 1 && r.runs[0].kind === 'math', r.runs.map((x) => `[${x.kind} ${textOf(x)}]`).join(''));
}

// ============================================
// Robustness: segment() must never throw
// ============================================
const ROBUST = [
  ['empty input', ''],
  ['all math', 'x^2 + y^2 = r^2'],
  ['all prose', 'we should probably think about this carefully'],
  ['lone STRING', '"just some words"'],
  ['unterminated quote', 'Let x = "oops'],
  ['unterminated math quote', 'Let x = $oops'],
  ['operators only', '=> <=> != +- ,'],
  ['stray punctuation', 'Is this true?'],
  ['unbalanced parens', 'f(x + (y'],
  ['200 mixed tokens', Array.from({ length: 40 }, (_, i) => `Let x_${i} be a real number suchthat x_${i}^2 = ${i}`).join(' ')],
];
for (const [label, src] of ROBUST) {
  let result = null;
  let threw = null;
  try { result = run(src); } catch (e) { threw = e; }
  check('Robustness', `${label} - segment() does not throw`, threw === null, threw && String(threw.stack || threw));
  if (result) checkInvariants('Robustness', label, result);
}
{
  const { tokens } = run(ROBUST[ROBUST.length - 1][1]);
  check('Robustness', '200-token case really is >= 200 tokens', tokens.length >= 200, `${tokens.length} tokens`);
}
{
  const { runs, explain } = run('');
  check('Robustness', 'empty input -> no runs, no records', runs.length === 0 && explain.length === 0);
}

// Diagnostics are advisory only: a tie ("sum" read as English) is reported as
// info with a hint, and a confident sentence reports nothing.
{
  const { diagnostics } = run('We use the sum and product rules');
  check('Diagnostics', 'a tied word emits one info diagnostic with a hint',
    diagnostics.length === 1 && diagnostics[0].severity === 'info' && !!diagnostics[0].hint && diagnostics[0].message.includes('sum'),
    JSON.stringify(diagnostics));
}
{
  const { diagnostics } = run('x in A and y in B => x + y in A union B');
  check('Diagnostics', 'a confident formula emits no diagnostics', diagnostics.length === 0, JSON.stringify(diagnostics));
}

// ============================================
// Visual check: the decision table for case 1 (printed, not asserted)
// ============================================
{
  const src = CASES[0][0];
  const { explain } = results.get(src);
  console.log(`\n${DIM}Decision table for:${RESET} ${src}`);
  console.log(`${DIM}${'word'.padEnd(10)}| ${'verdict'.padEnd(8)}| ${'score'.padStart(5)} | reasons${RESET}`);
  console.log(`${DIM}${'-'.repeat(78)}${RESET}`);
  for (const r of explain) {
    console.log(`${r.word.padEnd(10)}| ${r.verdict.padEnd(8)}| ${String(r.score).padStart(5)} | ${r.reasons.join(', ')}`);
  }
  console.log('');
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
