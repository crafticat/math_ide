/**
 * MathBrain Engine v2 - AUTOCOMPLETE_DATA compat gate
 *
 * constants.ts's AUTOCOMPLETE_DATA feeds the editor's autocomplete popup
 * (components/Editor.tsx) - every entry's `insert` template is text the app
 * will drop straight into the document the instant a user picks it. Nothing
 * upstream of the app ever compiles those templates against the real engine,
 * so if the grammar drifts out from under one (a function grows a required
 * arg, a keyword's table entry disappears, ...) nothing would notice here -
 * the suggestion would just start producing a parse warning the moment a
 * real user accepted it. This suite is that missing check.
 *
 * For every AUTOCOMPLETE_DATA entry:
 *   1. strip the `$0` cursor marker - replaced with a plausible identifier
 *      (`X`), not deleted outright, so a template like `Problem $0 {` probes
 *      as `Problem X {` (a real title), not `Problem  {` (an empty one);
 *   2. auto-balance: if the result still has an unmatched open `(`/`[`/`{`,
 *      close it (innermost first) so every probe is a compileable,
 *      self-contained snippet rather than a bracket-mismatch reject. In
 *      practice every CURRENT template already closes itself (the scope,
 *      subtask, matrix and cases templates all carry their own closing
 *      punctuation), so this is a no-op today - it exists so a future
 *      template that ISN'T self-closing still gets a fair probe instead of
 *      an artificial failure;
 *   3. compile() the result through the REAL engine (services/engine/) and
 *      require zero 'warn' diagnostics. An 'info' (e.g. an ambiguous-word
 *      note) is fine - it flags uncertainty, not a wrong answer.
 *
 * Five entries are exempted, narrowly: `implies` (`=>`), `iff` (`<=>`),
 * `plusminus` (`+-`), `minusplus` (`-+`) and `NOT` (`NOT `) are pure inline
 * operator/connective fragments - autocomplete inserts each one MID-
 * EXPRESSION, between a left operand already on the line and a right one the
 * user is about to type (`p $0` -> pick "implies" -> `p => `, cursor left
 * ready for the rest). None of the five is ever a complete statement by
 * itself, so probing one utterly alone - no operand on either side, which is
 * the whole point of testing a template in isolation - trips the parser's
 * own CORRECT "expression ends early - missing operand" diagnostic
 * (parser.ts's parseAtom). That is the engine doing its job, not
 * autocomplete-vs-engine drift, so each of the five is exempted for EXACTLY
 * that one diagnostic and no other: if compiling one of them ever produces a
 * DIFFERENT warning (a real parse failure, say), the exemption does not
 * cover it and the gate still fails. See FRAGMENT_EXEMPTIONS below.
 *
 * (Contrast `AND `/`OR `/`in`/`notin`/`subset`/`union`/`intersect`/`perp`/
 * `parallel`/`angle `/... - all likewise inline connective fragments, all
 * pass with zero warnings. They resolve to a bare Sym atom when parsed alone
 * because they are ALSO plain SYMBOL_MAP entries reachable in atom/nud
 * position, not just infix operators reachable in binary/led position; `=>`/
 * `<=>`/`+-`/`-+` are OP-kind tokens with no such standalone reading, and
 * `NOT` is in WORD_PREFIX, which claims it as a unary operator demanding an
 * operand before SYMBOL_MAP's bare-glyph fallback is ever reached. This
 * asymmetry is a property of the grammar, verified directly against the
 * real engine while writing this gate - not a guess.)
 *
 * Run with: node tests/engine/test-autocomplete-compat.mjs
 */

import { existsSync } from 'fs';
import { bundle } from './build.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MathBrain Engine v2 - AUTOCOMPLETE_DATA Compat Gate          ║');
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
// Bundle + import. constants.ts has zero imports of its own, so it bundles
// standalone (test-fuzz.mjs does the same for INITIAL_CONTENT).
// ============================================
const constantsUrl = bundle('constants.ts', 'constants-autocomplete.mjs');
check('Bundle', `constants bundled under .test-build (${constantsUrl})`, constantsUrl.includes('.test-build'));
check('Bundle', 'bundled constants file exists on disk', existsSync(new URL(constantsUrl)));

const { AUTOCOMPLETE_DATA } = await import(constantsUrl);
check('Bundle', 'constants bundle exports AUTOCOMPLETE_DATA (non-empty array)',
  Array.isArray(AUTOCOMPLETE_DATA) && AUTOCOMPLETE_DATA.length > 0,
  `length=${AUTOCOMPLETE_DATA && AUTOCOMPLETE_DATA.length}`);

const engineUrl = bundle('services/engine/engine.ts', 'engine-autocomplete.mjs');
check('Bundle', `engine bundled under .test-build (${engineUrl})`, engineUrl.includes('.test-build'));
check('Bundle', 'bundled engine file exists on disk', existsSync(new URL(engineUrl)));

const { compile } = await import(engineUrl);
check('Bundle', 'engine bundle exports compile()', typeof compile === 'function');

// ============================================
// $0 -> placeholder, then brace/paren/bracket auto-close (see header step 2)
// ============================================
const OPEN_TO_CLOSE = { '(': ')', '[': ']', '{': '}' };
const CLOSE_TO_OPEN = { ')': '(', ']': '[', '}': '{' };

/** Strips the `$0` cursor marker (replaced by a plausible identifier - see
 *  header) and closes any bracket the template alone leaves open, so every
 *  probe is a compileable, self-contained snippet. */
function toProbe(insert) {
  const stripped = insert.replace(/\$0/g, 'X');
  const openStack = [];
  for (const ch of stripped) {
    if (OPEN_TO_CLOSE[ch]) openStack.push(ch);
    else if (CLOSE_TO_OPEN[ch] && openStack[openStack.length - 1] === CLOSE_TO_OPEN[ch]) openStack.pop();
  }
  let closing = '';
  for (let i = openStack.length - 1; i >= 0; i--) closing += `\n${OPEN_TO_CLOSE[openStack[i]]}`;
  return stripped + closing;
}

// ============================================
// Inline operator/connective fragments - see header for why these five, and
// only these five, are exempted, and only for this exact diagnostic.
// ============================================
const MISSING_OPERAND = 'expression ends early — missing operand';
const FRAGMENT_EXEMPTIONS = new Set(['implies', 'iff', 'plusminus', 'minusplus', 'NOT']);

// ============================================
// The gate
// ============================================
let exemptedCount = 0;
for (const entry of AUTOCOMPLETE_DATA) {
  const probe = toProbe(entry.insert);
  const { diagnostics } = compile(probe);
  const warnings = diagnostics.filter((d) => d.severity === 'warn');

  const exempt = FRAGMENT_EXEMPTIONS.has(entry.label) &&
    warnings.length === 1 && warnings[0].message === MISSING_OPERAND;
  if (exempt) exemptedCount++;

  const ok = warnings.length === 0 || exempt;
  const note = exempt ? ' (exempted: inline operand-less fragment, only the expected missing-operand warning)' : '';
  check('Autocomplete', `'${entry.label}' -> ${JSON.stringify(entry.insert)} compiles clean${note}`, ok,
    ok ? undefined : `probe: ${JSON.stringify(probe)}\n      warnings: ${warnings.map((w) => w.message).join(' | ')}`);
}

// ============================================
// Summary
// ============================================
console.log('\n' + '═'.repeat(50));
console.log(`Total: ${passed}/${passed + failed} checks passed (${exemptedCount} via the documented fragment exemption)`);

if (failed > 0) {
  console.log(`\n${RED}${failed} FAILED:${RESET}\n`);
  failures.forEach((f) => console.log(`  ${f}`));
  console.log('');
} else {
  console.log(`\n${GREEN}✓ All checks passed!${RESET}\n`);
}

process.exit(failed > 0 ? 1 : 0);
