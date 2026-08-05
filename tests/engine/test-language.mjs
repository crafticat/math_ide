/**
 * MathBrain Engine v2 - Language Table Test Suite
 * Bundles services/engine/language.ts with esbuild (via build.mjs) and
 * imports the REAL compiled output, so this test proves the esbuild
 * pipeline works end-to-end (not just that the TS source parses).
 * Run with: node tests/engine/test-language.mjs
 */

import { existsSync } from 'fs';
import { bundle } from './build.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MathBrain Engine v2 - Language Table Test Suite             ║');
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
const modUrl = bundle('services/engine/language.ts', 'language.mjs');
check('Bundle', `bundle() wrote output under .test-build (${modUrl})`, modUrl.includes('.test-build'));
check('Bundle', 'bundled output file exists on disk', existsSync(new URL(modUrl)));

const mod = await import(modUrl);
check('Bundle', 'bundled ESM module imported successfully', !!mod);

const {
  SYMBOL_MAP, GREEK, MATH_KEYWORDS, STOP_WORDS, FUNCTIONS, SCOPES, MATH_PACKAGE, RELATION_WORDS,
} = mod;

// ============================================
// Exports: all 8 named exports must exist
// ============================================
{
  const requiredExports = ['SYMBOL_MAP', 'GREEK', 'MATH_KEYWORDS', 'STOP_WORDS', 'FUNCTIONS', 'SCOPES', 'MATH_PACKAGE', 'RELATION_WORDS'];
  const missing = requiredExports.filter((name) => mod[name] === undefined);
  check('Exports', `module exports all of ${requiredExports.join(', ')}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`, missing.length === 0);
}

// ============================================
// SYMBOL_MAP: every value is a non-empty string
// ============================================
{
  const entries = Object.entries(SYMBOL_MAP || {});
  const badKeys = entries.filter(([, v]) => typeof v !== 'string' || v.length === 0).map(([k]) => k);
  check('SYMBOL_MAP', `all ${entries.length} values are non-empty strings${badKeys.length ? ` (bad keys: ${badKeys.join(', ')})` : ''}`, entries.length > 0 && badKeys.length === 0);
}

// ============================================
// GREEK: covers required Greek letters + eps/partial/inf
// ============================================
{
  const required = [
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'sigma', 'omega', 'pi', 'mu', 'phi', 'rho', 'tau',
    'zeta', 'eta', 'chi', 'psi', 'nu', 'kappa', 'iota', 'xi', 'upsilon',
    'Delta', 'Gamma', 'Theta', 'Lambda', 'Sigma', 'Omega', 'Pi', 'Phi', 'Psi', 'Xi',
    'eps', 'partial', 'inf',
  ];
  const missing = required.filter((k) => !(GREEK && typeof GREEK[k] === 'string' && GREEK[k].length > 0));
  check('GREEK', `covers all ${required.length} required letters/aliases${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`, missing.length === 0);
}

// ============================================
// SCOPES: has all 14 scope names, each 'bold' or 'italic'
// ============================================
{
  const required = ['Problem', 'Subproblem', 'Section', 'Part', 'Theorem', 'Case', 'Lemma', 'Definition', 'Corollary', 'Proposition', 'Proof', 'Claim', 'Remark', 'Example'];
  const missing = required.filter((k) => !(SCOPES && (SCOPES[k] === 'bold' || SCOPES[k] === 'italic')));
  check('SCOPES', `has all ${required.length} scope names with bold/italic styling${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`, missing.length === 0);
}

// ============================================
// FUNCTIONS: contains sqrt sum integral lim choose factorial matrix cases
// ============================================
{
  const required = ['sqrt', 'sum', 'integral', 'lim', 'choose', 'factorial', 'matrix', 'cases'];
  const missing = required.filter((k) => !(FUNCTIONS && FUNCTIONS[k]));
  check('FUNCTIONS', `contains all ${required.length} required function names${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`, missing.length === 0);
}

// ============================================
// STOP_WORDS: contains 'the', 'is', 'let', 'we'
// ============================================
{
  const required = ['the', 'is', 'let', 'we'];
  const stopSet = STOP_WORDS instanceof Set ? STOP_WORDS : new Set(STOP_WORDS || []);
  const missing = required.filter((w) => !stopSet.has(w));
  check('STOP_WORDS', `contains ${required.map((w) => `'${w}'`).join(', ')}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`, missing.length === 0);
}

// ============================================
// MATH_KEYWORDS: contains 'forall', 'exists', 'sqrt'
// ============================================
{
  const required = ['forall', 'exists', 'sqrt'];
  const kwSet = MATH_KEYWORDS instanceof Set ? MATH_KEYWORDS : new Set(MATH_KEYWORDS || []);
  const missing = required.filter((w) => !kwSet.has(w));
  check('MATH_KEYWORDS', `contains ${required.map((w) => `'${w}'`).join(', ')}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`, missing.length === 0);
}

// ============================================
// Consistency: every key present in both SYMBOL_MAP and GREEK has identical values
// ============================================
{
  const greekKeys = Object.keys(GREEK || {});
  const sharedKeys = greekKeys.filter((k) => Object.prototype.hasOwnProperty.call(SYMBOL_MAP || {}, k));
  const mismatches = sharedKeys.filter((k) => SYMBOL_MAP[k] !== GREEK[k]);
  check(
    'Consistency',
    `every key present in both SYMBOL_MAP and GREEK has identical values (${sharedKeys.length} checked)${mismatches.length ? ` (mismatched: ${mismatches.join(', ')})` : ''}`,
    sharedKeys.length > 0 && mismatches.length === 0,
  );
}

// ============================================
// Values: exact spot-checks
// ============================================
check('Values', "SYMBOL_MAP['=>'] === '\\implies'", SYMBOL_MAP && SYMBOL_MAP['=>'] === '\\implies');
check('Values', "SYMBOL_MAP['suchthat'] === '\\text{ s.t. }'", SYMBOL_MAP && SYMBOL_MAP['suchthat'] === '\\text{ s.t. }');
check('Values', "SYMBOL_MAP['QED'] === '\\blacksquare'", SYMBOL_MAP && SYMBOL_MAP['QED'] === '\\blacksquare');
check('Values', "SYMBOL_MAP['|'] === '\\mid'", SYMBOL_MAP && SYMBOL_MAP['|'] === '\\mid');
check('Values', "SYMBOL_MAP['+-'] === '\\pm'", SYMBOL_MAP && SYMBOL_MAP['+-'] === '\\pm');
check('Values', "SYMBOL_MAP['in'] === '\\in'", SYMBOL_MAP && SYMBOL_MAP['in'] === '\\in');
check('Values', "GREEK['eps'] === '\\varepsilon'", GREEK && GREEK['eps'] === '\\varepsilon');
check('Values', "GREEK['partial'] === '\\partial'", GREEK && GREEK['partial'] === '\\partial');
check('Values', "GREEK['inf'] === '\\infty'", GREEK && GREEK['inf'] === '\\infty');
check('Values', "MATH_PACKAGE['Math.reals'] === '\\mathbb{R}'", MATH_PACKAGE && MATH_PACKAGE['Math.reals'] === '\\mathbb{R}');
check('Values', "MATH_PACKAGE['Math.e'] === 'e'", MATH_PACKAGE && MATH_PACKAGE['Math.e'] === 'e');
check('Values', "SCOPES['Proof'] === 'italic'", SCOPES && SCOPES['Proof'] === 'italic');
check('Values', "SCOPES['Theorem'] === 'bold'", SCOPES && SCOPES['Theorem'] === 'bold');
check('Values', "FUNCTIONS['choose'].arity === 2", !!(FUNCTIONS && FUNCTIONS['choose'] && FUNCTIONS['choose'].arity === 2));
check('Values', "FUNCTIONS['factorial'].arity === 1", !!(FUNCTIONS && FUNCTIONS['factorial'] && FUNCTIONS['factorial'].arity === 1));
check('Values', "FUNCTIONS['sum'].kind === 'big'", !!(FUNCTIONS && FUNCTIONS['sum'] && FUNCTIONS['sum'].kind === 'big'));
check('Values', "FUNCTIONS['cases'].kind === 'matrix'", !!(FUNCTIONS && FUNCTIONS['cases'] && FUNCTIONS['cases'].kind === 'matrix'));
check('Values', "FUNCTIONS['abs'].kind === 'delim'", !!(FUNCTIONS && FUNCTIONS['abs'] && FUNCTIONS['abs'].kind === 'delim'));

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
