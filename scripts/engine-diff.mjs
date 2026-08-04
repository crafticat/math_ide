/**
 * Dual-engine diff harness (developer tool, not part of the test suite).
 *
 * Runs the SAME inputs through BOTH real engines -
 *   legacy : services/compiler.ts        (compileMathScript)
 *   v2     : services/engine/engine.ts   (compile)
 * - and writes every disagreement to scripts/engine-diff-report.md for human
 * inspection. Both engines are bundled from TypeScript source with esbuild, so
 * this compares the code that actually ships; in particular it never touches
 * the drifted inline copy of the old compiler that lives in test-advanced.mjs.
 *
 * Inputs:
 *   - the 175-case corpus (tests/engine/test-corpus.mjs, imported for its
 *     CORPUS export - that module's runner is main-guarded, so importing it
 *     does not run the suite), each as a one-line statement, and
 *   - the whole INITIAL_CONTENT document from constants.ts, compiled as one
 *     document by each engine and compared line by line.
 *
 * The report is a classification worksheet. For a case that still carries its
 * PRE-FREEZE legacy assertion (`expected` / `contains` / `notContains`) it also
 * records whether that assertion still holds against the v2 output - the test
 * that decides whether the golden can be kept or has to be re-frozen. A case
 * that has ALREADY been re-frozen (`latex`) is reported as such and nothing
 * else: its assertion IS the v2 output, so re-checking it would only ever
 * print "STILL HOLDS" and would say nothing at all about the legacy engine.
 * The assertion it replaced lives in
 * docs/superpowers/specs/2026-08-04-golden-migration-notes.md.
 *
 * Run with: node scripts/engine-diff.mjs
 */

import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { bundle } from '../tests/engine/build.mjs';
import { CORPUS } from '../tests/engine/test-corpus.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const REPORT_PATH = resolve(__dirname, 'engine-diff-report.md');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const { compileMathScript } = await import(bundle('services/compiler.ts', 'legacy-compiler.mjs'));
const { compile } = await import(bundle('services/engine/engine.ts', 'engine-corpus.mjs'));
const { INITIAL_CONTENT } = await import(bundle('constants.ts', 'constants.mjs'));

/** Both engines' latex for one source, as a single string (one line per
 *  rendered line) plus the raw line list for document alignment. */
const runLegacy = (source) => {
  try {
    const { latexLines } = compileMathScript(source);
    return { lines: latexLines, latex: latexLines.map((l) => l.latex).join('\n'), threw: null };
  } catch (e) {
    return { lines: [], latex: '', threw: e.message };
  }
};

const runV2 = (source) => {
  try {
    const { latexLines, diagnostics } = compile(source);
    return {
      lines: latexLines,
      latex: latexLines.map((l) => l.latex).join('\n'),
      diagnostics,
      threw: null,
    };
  } catch (e) {
    return { lines: [], latex: '', diagnostics: [], threw: e.message };
  }
};

/** A case that has already been re-frozen against v2 output carries no legacy
 *  assertion any more, so there is nothing to re-check for it. */
const isFrozen = (tc) => tc.latex !== undefined;

/** Does the case's ORIGINAL legacy assertion still hold for this output?
 *  Only meaningful for a NOT-frozen case - see isFrozen. */
const assertionHolds = (tc, latex) => {
  if (tc.expected !== undefined) return latex === tc.expected;
  if (tc.contains !== undefined) return latex.includes(tc.contains);
  return !latex.includes(tc.notContains);
};

const assertionLine = (tc, latex) => {
  if (isFrozen(tc)) {
    return `- assertion: **re-frozen against v2** (class ${tc.class}) \`${tc.latex}\`` +
      ' — the legacy assertion it replaced is in the migration notes';
  }
  const text = tc.expected !== undefined ? `expected: ${tc.expected}`
    : tc.contains !== undefined ? `contains: ${tc.contains}`
      : `notContains: ${tc.notContains}`;
  return `- legacy assertion: \`${text}\` -> **${assertionHolds(tc, latex) ? 'STILL HOLDS' : 'BROKEN by v2'}**`;
};

// ---- Corpus ----

const corpusDiffs = [];
let corpusIdentical = 0;
let stillPassing = 0;
const unfrozen = CORPUS.filter((tc) => !isFrozen(tc));

for (const tc of CORPUS) {
  const legacy = runLegacy(tc.input);
  const v2 = runV2(tc.input);
  if (!isFrozen(tc) && assertionHolds(tc, v2.latex)) stillPassing++;
  if (legacy.latex === v2.latex && !legacy.threw && !v2.threw) {
    corpusIdentical++;
    continue;
  }
  corpusDiffs.push({ tc, legacy, v2 });
}

// ---- INITIAL_CONTENT, as a whole document ----

const docLegacy = runLegacy(INITIAL_CONTENT);
const docV2 = runV2(INITIAL_CONTENT);

// Align by source line: both engines report originalLine for every rendered
// line, so a line the other engine dropped shows up as a missing counterpart
// rather than shifting everything after it.
const byOriginal = (lines) => {
  const map = new Map();
  for (const l of lines) {
    if (!map.has(l.originalLine)) map.set(l.originalLine, []);
    map.get(l.originalLine).push(l.latex);
  }
  return map;
};
const legacyDoc = byOriginal(docLegacy.lines);
const v2Doc = byOriginal(docV2.lines);
const allOriginals = [...new Set([...legacyDoc.keys(), ...v2Doc.keys()])].sort((a, b) => a - b);
const sourceLines = INITIAL_CONTENT.split('\n');

const docDiffs = [];
let docIdentical = 0;
for (const originalLine of allOriginals) {
  const a = (legacyDoc.get(originalLine) ?? []).join('\n');
  const b = (v2Doc.get(originalLine) ?? []).join('\n');
  if (a === b) {
    docIdentical++;
    continue;
  }
  docDiffs.push({ originalLine, source: sourceLines[originalLine - 1] ?? '', legacy: a, v2: b });
}

// ---- Report ----

const fence = (s) => (s === '' ? '_(no output)_' : '```latex\n' + s + '\n```');

const out = [];
out.push('# Engine diff report - legacy `services/compiler.ts` vs v2 `services/engine/engine.ts`');
out.push('');
out.push('Generated by `node scripts/engine-diff.mjs`. Every entry below is an input the two');
out.push('engines render differently. "legacy assertion" is the original test-advanced.mjs');
out.push('expectation for that case and whether the v2 output still satisfies it; cases whose');
out.push('golden has already been re-frozen against v2 output carry no legacy assertion any');
out.push('more and are labelled as re-frozen instead (see the migration notes for what each');
out.push('one replaced).');
out.push('');
out.push(`- corpus inputs: ${CORPUS.length} (${corpusIdentical} identical, ${corpusDiffs.length} differing)`);
out.push(`- corpus cases still carrying a legacy assertion: ${unfrozen.length}/${CORPUS.length} (${CORPUS.length - unfrozen.length} re-frozen against v2)`);
out.push(`- of those, legacy assertions still holding on v2 output: ${stillPassing}/${unfrozen.length}`);
out.push(`- INITIAL_CONTENT source lines with output: ${allOriginals.length} (${docIdentical} identical, ${docDiffs.length} differing)`);
out.push('');
out.push('## Corpus diffs');
out.push('');
if (corpusDiffs.length === 0) out.push('_None._');
for (const { tc, legacy, v2 } of corpusDiffs) {
  out.push(`### #${tc.id} [${tc.category}] \`${tc.input}\``);
  out.push('');
  out.push(assertionLine(tc, v2.latex));
  if (v2.diagnostics?.length) {
    out.push(`- v2 diagnostics: ${v2.diagnostics.map((d) => `${d.severity}: ${d.message}`).join(' | ')}`);
  }
  if (legacy.threw) out.push(`- legacy THREW: ${legacy.threw}`);
  if (v2.threw) out.push(`- v2 THREW: ${v2.threw}`);
  out.push('');
  out.push('legacy:');
  out.push(fence(legacy.latex));
  out.push('v2:');
  out.push(fence(v2.latex));
  out.push('');
}

out.push('## INITIAL_CONTENT diffs');
out.push('');
if (docDiffs.length === 0) out.push('_None._');
for (const { originalLine, source, legacy, v2 } of docDiffs) {
  out.push(`### source line ${originalLine}: \`${source.trim()}\``);
  out.push('');
  out.push('legacy:');
  out.push(fence(legacy));
  out.push('v2:');
  out.push(fence(v2));
  out.push('');
}

out.push('## Summary');
out.push('');
out.push('| | total | identical | differing |');
out.push('|---|---|---|---|');
out.push(`| corpus inputs | ${CORPUS.length} | ${corpusIdentical} | ${corpusDiffs.length} |`);
out.push(`| INITIAL_CONTENT lines | ${allOriginals.length} | ${docIdentical} | ${docDiffs.length} |`);
out.push('');
out.push(`Legacy assertions still satisfied by v2: **${stillPassing}/${unfrozen.length}** of the cases that still have one`);
out.push(`(${unfrozen.length - stillPassing} need a re-frozen golden or an engine fix; ${CORPUS.length - unfrozen.length} are already re-frozen.)`);
out.push('');
out.push(`v2 diagnostics over the corpus: ${CORPUS.filter((tc) => runV2(tc.input).diagnostics.length > 0).length} inputs`);
out.push(`v2 diagnostics over INITIAL_CONTENT: ${docV2.diagnostics.length}`);
out.push('');

writeFileSync(REPORT_PATH, out.join('\n'));

console.log(`${GREEN}wrote${RESET} ${REPORT_PATH}`);
console.log(`corpus:           ${CORPUS.length} inputs, ${corpusIdentical} identical, ${YELLOW}${corpusDiffs.length} differing${RESET}`);
console.log(`legacy assertions still holding on v2: ${stillPassing}/${unfrozen.length} (${CORPUS.length - unfrozen.length} re-frozen against v2)`);
console.log(`INITIAL_CONTENT:  ${allOriginals.length} lines, ${docIdentical} identical, ${YELLOW}${docDiffs.length} differing${RESET}`);
console.log(`${DIM}v2 diagnostics over INITIAL_CONTENT: ${docV2.diagnostics.length}${RESET}`);
