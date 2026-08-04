/**
 * MathBrain Engine v2 - Fuzz + KaTeX Validation Suite (Task 9)
 *
 * The never-fails guarantee. Every other engine suite pins BEHAVIOUR (this
 * input produces exactly this LaTeX); this one instead throws unstructured
 * garbage at the pipeline and checks the two properties that have to hold no
 * matter what the user types into a live editor:
 *
 *   1. compile() / nodeAt() / renderLineWithHighlight() NEVER throw, on any
 *      input - including every PREFIX of a real document, which is what the
 *      editor actually feeds the engine on every keystroke, and which the
 *      corpus (single, complete, well-formed statements) never exercises.
 *   2. every LaTeX string the engine hands back is valid LaTeX - it passes
 *      katex.renderToString({ throwOnError: true }). A recovered Raw span
 *      rendering as \texttt is fine; a string KaTeX itself rejects is an
 *      engine bug, not a fuzz false positive.
 *
 * Five groups:
 *   (a) TokenSoup  - 500 random documents assembled from MathScript
 *                    fragments (seeded mulberry32, no Math.random anywhere
 *                    in this file). Never throws; timed (worst single
 *                    compile must stay under 250ms).
 *   (b) Prefix     - every character prefix (capped, evenly spaced) of
 *                    every one of the 175 corpus inputs plus the real
 *                    INITIAL_CONTENT demo document. Never throws.
 *   (c) KaTeX      - every LaTeX line produced by (a)'s first 100 docs and
 *                    ALL of (b)'s prefixes passes katex.renderToString.
 *   (d) NodeAt     - nodeAt() over random (line, col) probes on 50 of the
 *                    soup docs never throws and always returns null or a
 *                    well-formed NodeHit.
 *   (e) Highlight  - wherever (d) found a hit, renderLineWithHighlight()
 *                    never throws and its LaTeX still passes KaTeX.
 *
 * NOTE on this suite's own track record: the FIRST run of exactly this
 * generator (seed 42, as specified) came back 0/0 - it did not, on its own,
 * find any of the three real render.ts bugs fixed while building this suite
 * (a KaTeX "Double superscript" on an alternating `x^a_b^a_b...` script
 * chain; a cubic-time blowup in the fix for that; orphaned leading Unicode
 * combining marks / lone UTF-16 surrogates producing invalid LaTeX). All
 * three needed hand-constructed adversarial input to surface, not uniform
 * random sampling over the fragment alphabet below - and all three are now
 * pinned byte-for-byte in test-render.mjs's "Fuzz-discovered fixes" section,
 * which is what actually catches a regression in them; a clean run of THIS
 * file is not, by itself, evidence they stayed fixed.
 *
 * Run with: node tests/engine/test-fuzz.mjs
 */

import { existsSync } from 'fs';
import { createRequire } from 'module';
import { bundle } from './build.mjs';
import { CORPUS } from './test-corpus.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MathBrain Engine v2 - Fuzz + KaTeX Validation Suite         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;
const failures = [];
const categories = new Map();

function record(category, ok) {
  if (!categories.has(category)) categories.set(category, { passed: 0, failed: 0 });
  categories.get(category)[ok ? 'passed' : 'failed']++;
}

function check(group, description, condition, detail) {
  record(group, condition);
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
// Seeded PRNG - mulberry32, seed 42. The ONLY source of randomness in this
// file (no Math.random anywhere), so a failure is always reproducible by
// just re-running the suite.
// ============================================
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
// Inclusive both ends.
const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const choice = (arr) => arr[Math.floor(rand() * arr.length)];

// Truncates a fuzz input for readable failure output without flooding the
// console with a 2KB document.
const preview = (s, n = 200) => {
  const str = JSON.stringify(s);
  return str.length > n ? `${str.slice(0, n)}...(${s.length} chars)` : str;
};

// ============================================
// Bundle + import
// ============================================
const engineUrl = bundle('services/engine/engine.ts', 'engine-fuzz.mjs');
check('Bundle', `engine bundle wrote output under .test-build (${engineUrl})`, engineUrl.includes('.test-build'));
check('Bundle', 'engine bundled output file exists on disk', existsSync(new URL(engineUrl)));

const { compile, nodeAt, renderLineWithHighlight } = await import(engineUrl);
check('Bundle', 'module exports compile()', typeof compile === 'function');
check('Bundle', 'module exports nodeAt()', typeof nodeAt === 'function');
check('Bundle', 'module exports renderLineWithHighlight()', typeof renderLineWithHighlight === 'function');

// constants.ts has zero imports of its own, so bundling it directly (rather
// than routing through a throwaway re-export entry) is the simplest thing
// that works - verified before relying on it here.
const constantsUrl = bundle('constants.ts', 'constants-fuzz.mjs');
const { INITIAL_CONTENT } = await import(constantsUrl);
check('Bundle', 'constants bundle exports INITIAL_CONTENT (non-empty string)',
  typeof INITIAL_CONTENT === 'string' && INITIAL_CONTENT.length > 0, `length=${INITIAL_CONTENT && INITIAL_CONTENT.length}`);

/**
 * KaTeX, from $MATHBRAIN_KATEX_DIR or the repo's own node_modules - same gate
 * test-corpus.mjs uses (THROWS when neither resolves: a fuzz run that could
 * not check LaTeX validity has not run this suite).
 */
function loadKatex() {
  const dirs = [
    process.env.MATHBRAIN_KATEX_DIR,
    new URL('../../node_modules', import.meta.url).pathname,
  ].filter(Boolean);
  for (const dir of dirs) {
    const entry = `${dir}/katex/package.json`;
    if (!existsSync(entry)) continue;
    try {
      return createRequire(`${dir}/`)('katex');
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    'KaTeX not found — the fuzz suite cannot check that its output is valid LaTeX.\n' +
    `  looked in: ${dirs.join('\n             ')}\n` +
    '  fix: run `npm install` (katex is a devDependency), or point\n' +
    '       $MATHBRAIN_KATEX_DIR at a node_modules directory containing it.');
}
const katex = loadKatex();

// Shared KaTeX validator for (c) and (e): every latex string either group
// produces funnels through here, so "first 10 failures" is one list, not
// two. Not counted via check() per-call (that would be thousands of green
// lines) - callers aggregate into one summary check per group instead.
const katexFailures = [];
let katexChecked = 0;
function katexValid(group, input, latex) {
  katexChecked++;
  let error = null;
  try {
    const html = katex.renderToString(latex, { throwOnError: true, strict: false, trust: true });
    if (html.includes('katex-error')) error = 'katex-error span in output';
  } catch (e) {
    error = (e && e.message) || String(e);
  }
  if (error) katexFailures.push({ group, input, latex, error });
  return error === null;
}

// A single well-formed Span: integer bounds, start not after end.
function isWellFormedSpan(span) {
  return !!span &&
    Number.isInteger(span.startLine) && Number.isInteger(span.startCol) &&
    Number.isInteger(span.endLine) && Number.isInteger(span.endCol) &&
    (span.startLine < span.endLine || (span.startLine === span.endLine && span.startCol <= span.endCol));
}

// A compile() result has the shape engine.ts's EngineResult promises, without
// asserting anything about its CONTENT (that is every other suite's job).
function isWellFormedResult(r) {
  return !!r && Array.isArray(r.latexLines) && r.latexLines.every((l) => typeof l.latex === 'string' && typeof l.id === 'string') &&
    Array.isArray(r.diagnostics) && Array.isArray(r.index) && !!r.ast && Array.isArray(r.sourceLines);
}

// ============================================
// (a) Token-soup fuzz
// ============================================
// The alphabet is a plain whitespace split of the fragment string from the
// task spec - "cases {" and "matrix([[" keep their own internal spacing (or
// lack of it) exactly as given, and duplicated fragments (the braces appear
// under several idioms) just shift sampling frequency, which is fine: the
// goal is coverage of shapes, not a uniform distribution.
const ALPHABET = `sqrt( sum( lim( integral( matrix([[ cases { -> => <=> != <= >= +- ^ _ / * | " $ { } ( ) [ ] ; : , . ' forall exists suchthat eps delta pi in notin union and or not AND Problem Theorem Proof { } - -- ?: #define x y A B f g 1 2 3.14 dx Let assume the is continuous`
  .trim().split(/\s+/);
check('TokenSoup', `alphabet has the expected 69 fragments`, ALPHABET.length === 69, `got ${ALPHABET.length}`);

// A random document: 1-8 lines, each 0-30 fragments. Fragments are joined
// with a space about half the time and jammed together with no separator the
// rest - "pathological adjacencies" per the spec (two WORDs glue into one
// token, two OPs form a longer-lexeme-that-isn't, etc).
function randomDoc() {
  const lineCount = randInt(1, 8);
  const lines = [];
  for (let l = 0; l < lineCount; l++) {
    const fragCount = randInt(0, 30);
    let line = '';
    for (let k = 0; k < fragCount; k++) {
      if (k > 0 && rand() < 0.5) line += ' ';
      line += choice(ALPHABET);
    }
    lines.push(line);
  }
  return lines.join('\n');
}

const SOUP_COUNT = 500;
const SOUP_DOCS = Array.from({ length: SOUP_COUNT }, () => randomDoc());

let soupTotalMs = 0;
let soupWorstMs = -1;
let soupWorstDoc = '';
const soupFailures = [];
// The first 100 compiled results are kept: (c) KaTeX-checks their output,
// (d)/(e) reuse the first 50 of THOSE for caret fuzzing - recompiling would
// just waste the work the loop below already did.
const soupResults = [];

for (let i = 0; i < SOUP_DOCS.length; i++) {
  const doc = SOUP_DOCS[i];
  const t0 = performance.now();
  let result = null;
  let threw = null;
  try {
    result = compile(doc);
  } catch (err) {
    threw = err;
  }
  const dt = performance.now() - t0;
  soupTotalMs += dt;
  if (dt > soupWorstMs) { soupWorstMs = dt; soupWorstDoc = doc; }

  if (threw) {
    soupFailures.push(`doc #${i} THREW: ${threw && threw.message}\n      input: ${preview(doc)}`);
  } else if (!isWellFormedResult(result)) {
    soupFailures.push(`doc #${i} returned a malformed result\n      input: ${preview(doc)}`);
  } else if (i < 100) {
    soupResults.push({ doc, result });
  }
}

check('TokenSoup', `all ${SOUP_COUNT} random documents compile without throwing, with a well-formed result`,
  soupFailures.length === 0, soupFailures.slice(0, 10).join('\n      '));
check('TokenSoup', `worst single compile is ${soupWorstMs.toFixed(2)}ms (<= 250ms)`, soupWorstMs <= 250,
  `doc: ${preview(soupWorstDoc)}`);
console.log(`  ${GREEN}stats${RESET} TokenSoup: ${SOUP_COUNT} docs, total ${soupTotalMs.toFixed(1)}ms, ` +
  `worst ${soupWorstMs.toFixed(2)}ms, avg ${(soupTotalMs / SOUP_COUNT).toFixed(3)}ms`);

// ============================================
// (b) Prefix fuzz
// ============================================
// Prefix lengths 1..len, capped at 60 and evenly spaced (by index, not by
// character - a rounding scheme is fine here, this is a sampling cap, not a
// precision requirement) when len exceeds the cap.
const PREFIX_CAP = 60;
function prefixLengths(len, cap) {
  if (len <= 0) return [];
  if (len <= cap) return Array.from({ length: len }, (_, i) => i + 1);
  const out = [];
  for (let i = 0; i < cap; i++) {
    out.push(1 + Math.round((i / (cap - 1)) * (len - 1)));
  }
  return Array.from(new Set(out)); // ascending order preserved (numbers, insertion order)
}

const PREFIX_INPUTS = [...CORPUS.map((tc) => tc.input), INITIAL_CONTENT];
const prefixFailures = [];
let prefixChecked = 0;
// {input, latexLines}[] for stage (c) - every prefix's output, uncapped
// beyond the per-input prefix cap already applied above.
const prefixOutputs = [];

for (const input of PREFIX_INPUTS) {
  for (const len of prefixLengths(input.length, PREFIX_CAP)) {
    const prefix = input.slice(0, len);
    prefixChecked++;
    let result = null;
    let threw = null;
    try {
      result = compile(prefix);
    } catch (err) {
      threw = err;
    }
    if (threw) {
      prefixFailures.push(`prefix len ${len} THREW: ${threw && threw.message}\n      prefix: ${preview(prefix)}`);
    } else if (!isWellFormedResult(result)) {
      prefixFailures.push(`prefix len ${len} returned a malformed result\n      prefix: ${preview(prefix)}`);
    } else {
      prefixOutputs.push({ input: prefix, latexLines: result.latexLines });
    }
  }
}

check('Prefix', `all ${prefixChecked} character prefixes (${PREFIX_INPUTS.length} inputs, cap ${PREFIX_CAP}/input) compile without throwing`,
  prefixFailures.length === 0, prefixFailures.slice(0, 10).join('\n      '));

// ============================================
// (c) KaTeX validation of everything (a) + (b) produced
// ============================================
for (const { input, latexLines } of prefixOutputs) {
  for (const line of latexLines) katexValid('KaTeX-Prefix', input, line.latex);
}
for (const { doc, result } of soupResults) {
  for (const line of result.latexLines) katexValid('KaTeX-Soup', doc, line.latex);
}

check('KaTeX', `all ${katexChecked} sampled LaTeX outputs (${prefixOutputs.length} prefix results + ${soupResults.length} soup docs) render under katex.renderToString`,
  katexFailures.length === 0, `${katexFailures.length} failed - see report below`);

if (katexFailures.length > 0) {
  console.log(`\n${RED}${katexFailures.length} KaTeX validation failures - first 10:${RESET}`);
  for (const f of katexFailures.slice(0, 10)) {
    console.log(`  [${f.group}] input: ${preview(f.input)}`);
    console.log(`    latex: ${f.latex}`);
    console.log(`    error: ${f.error}`);
  }
  console.log('');
}

// ============================================
// (d) nodeAt fuzz
// ============================================
const NODEAT_DOCS = 50;
const nodeAtFailures = [];
// (doc, result, line, col) for every probe where nodeAt found a hit - (e)
// reuses exactly these so it only re-renders positions known to resolve.
const hitProbes = [];

for (let i = 0; i < NODEAT_DOCS && i < soupResults.length; i++) {
  const { doc, result } = soupResults[i];
  const lineCount = doc.split('\n').length;
  for (let p = 0; p < 100; p++) {
    // Deliberately ranges outside the valid (line, col) domain too (negative,
    // past EOF): nodeAt is documented to return null gracefully there rather
    // than throw, and only random sampling reliably hits those edges.
    const line = randInt(-2, lineCount + 3);
    const col = randInt(-10, 300);
    let hit;
    try {
      hit = nodeAt(result, line, col);
    } catch (err) {
      nodeAtFailures.push(`doc #${i} @ ${line}:${col} THREW: ${err && err.message}\n      input: ${preview(doc)}`);
      continue;
    }
    if (hit === null) continue;
    const shapeOk = !!hit.expr && typeof hit.expr.kind === 'string' && isWellFormedSpan(hit.expr.span) &&
      !!hit.statement && typeof hit.statement.line === 'number' && Array.isArray(hit.statement.segments) &&
      isWellFormedSpan(hit.statement.span);
    if (!shapeOk) {
      nodeAtFailures.push(`doc #${i} @ ${line}:${col} returned a malformed NodeHit: ${preview(JSON.stringify(hit), 150)}\n      input: ${preview(doc)}`);
      continue;
    }
    hitProbes.push({ doc, result, line, col });
  }
}

check('NodeAt', `${NODEAT_DOCS} docs x 100 random (line,col) probes: nodeAt never throws, always null or a well-formed NodeHit`,
  nodeAtFailures.length === 0, nodeAtFailures.slice(0, 10).join('\n      '));
console.log(`  ${GREEN}stats${RESET} NodeAt: ${NODEAT_DOCS * 100} probes, ${hitProbes.length} resolved to a node`);

// ============================================
// (e) renderLineWithHighlight fuzz
// ============================================
const HIGHLIGHT_CAP = 200;
const highlightFailures = [];
let highlightChecked = 0;
const highlightKatexBefore = katexFailures.length;

for (const { doc, result, line, col } of hitProbes.slice(0, HIGHLIGHT_CAP)) {
  highlightChecked++;
  // Reuses the SAME EngineResult (d)'s nodeAt hit came from - not a fresh
  // compile() of `doc`, which would build new Block objects sharing no
  // object identity with the ones the hit resolved against (renderStatement's
  // segments are keyed by block identity - see engine.ts's `parsed` map).
  let out;
  try {
    out = renderLineWithHighlight(result, line, col);
  } catch (err) {
    highlightFailures.push(`@ ${line}:${col} THREW: ${err && err.message}\n      input: ${preview(doc)}`);
    continue;
  }
  const shapeOk = out === null || (typeof out.line === 'number' && typeof out.latex === 'string');
  if (!shapeOk) {
    highlightFailures.push(`@ ${line}:${col} returned a malformed result: ${preview(JSON.stringify(out), 150)}\n      input: ${preview(doc)}`);
    continue;
  }
  if (out) katexValid('KaTeX-Highlight', doc, out.latex);
}

check('Highlight', `${highlightChecked} highlight re-renders (cap ${HIGHLIGHT_CAP}) never throw, always null or {line, latex}`,
  highlightFailures.length === 0, highlightFailures.slice(0, 10).join('\n      '));
check('Highlight', `every highlighted line among them still renders under KaTeX`,
  katexFailures.length === highlightKatexBefore, `${katexFailures.length - highlightKatexBefore} failed - see KaTeX report above`);

// ============================================
// Category Summary
// ============================================
console.log('\nCategory Summary:');
console.log('─'.repeat(60));
for (const [category, stats] of categories) {
  const total = stats.passed + stats.failed;
  const ok = stats.failed === 0;
  console.log(`${ok ? GREEN + '✓' : RED + '✗'}${RESET} ${category.padEnd(18)} ${stats.passed}/${total} checks passed`);
}

console.log('\n' + '═'.repeat(60));
console.log(`Fuzz:   ${SOUP_COUNT} token-soup docs, ${prefixChecked} prefixes, ${katexChecked} KaTeX renders, ` +
  `${NODEAT_DOCS * 100} nodeAt probes, ${highlightChecked} highlight re-renders`);
console.log(`Timing: TokenSoup total ${soupTotalMs.toFixed(1)}ms, worst single compile ${soupWorstMs.toFixed(2)}ms`);
console.log(`Total:  ${passed}/${passed + failed} checks passed`);

if (failed > 0) {
  console.log(`\n${RED}${failed} FAILED:${RESET}\n`);
  failures.forEach((f) => console.log(`  ${f}`));
  console.log('');
} else {
  console.log(`\n${GREEN}✓ All checks passed!${RESET}\n`);
}

process.exit(failed > 0 ? 1 : 0);
