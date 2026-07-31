/**
 * MathBrain Engine v2 - Document Parser Test Suite
 * Bundles services/engine/document.ts AND services/engine/lexer.ts (as two
 * separate esbuild bundles, per the task plan) and imports the REAL compiled
 * output of both, so this proves the pipeline works end-to-end: real lex()
 * output feeds real parseDocument().
 * Run with: node tests/engine/test-document.mjs
 */

import { existsSync } from 'fs';
import { bundle } from './build.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MathBrain Engine v2 - Document Parser Test Suite            ║');
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
// Bundle + import (proves the esbuild pipeline works for both modules)
// ============================================
const lexerUrl = bundle('services/engine/lexer.ts', 'lexer-for-document.mjs');
const documentUrl = bundle('services/engine/document.ts', 'document.mjs');
check('Bundle', `lexer bundle wrote output under .test-build (${lexerUrl})`, lexerUrl.includes('.test-build'));
check('Bundle', 'lexer bundled output file exists on disk', existsSync(new URL(lexerUrl)));
check('Bundle', `document bundle wrote output under .test-build (${documentUrl})`, documentUrl.includes('.test-build'));
check('Bundle', 'document bundled output file exists on disk', existsSync(new URL(documentUrl)));

const lexerMod = await import(lexerUrl);
const documentMod = await import(documentUrl);
check('Bundle', 'lexer module imported successfully and exports lex()', typeof lexerMod.lex === 'function');
check('Bundle', 'document module imported successfully and exports parseDocument()', typeof documentMod.parseDocument === 'function');

const { lex } = lexerMod;
const { parseDocument } = documentMod;

// ============================================
// Helpers
// ============================================
// Runs the real pipeline: lex() -> parseDocument(), merging lexer diagnostics
// with document-stage diagnostics into one array (mirroring how a real
// caller would wire the two stages together).
function parse(source) {
  const { tokens, diagnostics: lexDiags } = lex(source);
  const diagnostics = [...lexDiags];
  const ast = parseDocument(tokens, diagnostics);
  return { ast, diagnostics };
}

const tseq = (tokens) => tokens.map((t) => `${t.kind}:${t.text}`);

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

// ============================================
// (a) Full Bernoulli document -> exact tree shape, macro table, macro
// expansion inside statement tokens, Blank block for the #define line.
// ============================================
{
  const BERNOULLI = `#define N Math.naturals
Problem 3 {
  Theorem Bernoulli inequality {
    forall x >= -1 forall n in N: (1+x)^n >= 1 + n dot x
  }
  Proof {
    - base case {
      ?: (1+x)^0 >= 1 + 0 dot x {
        (1+x)^0 = 1 >= 1 = 1 + 0 dot x
      }
    }
    - inductive step {
      Assume (1+x)^n >= 1 + n dot x
      Then (1+x)^(n+1) = (1+x)^n dot (1+x) >= (1 + n dot x)(1 + x) = 1 + (n+1) dot x + n dot x^2 >= 1 + (n+1) dot x
      QED
    }
  }
}`;

  const { ast, diagnostics } = parse(BERNOULLI);

  check('Bernoulli', 'macros === { N: "Math.naturals" }', JSON.stringify(ast.macros) === JSON.stringify({ N: 'Math.naturals' }));

  check(
    'Bernoulli',
    'top-level blocks are exactly [Blank (the #define line), Scope(Problem)]',
    ast.blocks.length === 2 && ast.blocks[0].kind === 'Blank' && ast.blocks[1].kind === 'Scope',
  );

  const problem = ast.blocks[1] || {};
  check('Bernoulli', 'Problem scope: scopeType=Problem, title="3"', problem.kind === 'Scope' && problem.scopeType === 'Problem' && problem.title === '3');
  check(
    'Bernoulli',
    'Problem has 2 children, both Scope (Theorem, Proof)',
    Array.isArray(problem.children) && problem.children.length === 2 && problem.children[0].kind === 'Scope' && problem.children[1].kind === 'Scope',
  );

  const theorem = (problem.children || [])[0] || {};
  check(
    'Bernoulli',
    'Theorem scope: scopeType=Theorem, title="Bernoulli inequality"',
    theorem.scopeType === 'Theorem' && theorem.title === 'Bernoulli inequality',
  );
  check('Bernoulli', 'Theorem has exactly 1 child: Statement', Array.isArray(theorem.children) && theorem.children.length === 1 && theorem.children[0].kind === 'Statement');

  const theoremStmt = (theorem.children || [])[0] || {};
  const theoremTexts = tseq(theoremStmt.tokens || []);
  const macroExpandedAt = theoremTexts.findIndex(
    (t, i) => t === 'WORD:Math' && theoremTexts[i + 1] === 'OP:.' && theoremTexts[i + 2] === 'WORD:naturals',
  );
  check('Bernoulli', 'theorem Statement.tokens contains macro-expanded WORD:Math OP:. WORD:naturals', macroExpandedAt !== -1);
  check('Bernoulli', 'theorem Statement.tokens contains NO WORD:N (macro name fully replaced)', !theoremTexts.includes('WORD:N'));

  const proof = (problem.children || [])[1] || {};
  check('Bernoulli', 'Proof scope: scopeType=Proof, title="" (empty)', proof.scopeType === 'Proof' && proof.title === '');
  check(
    'Bernoulli',
    'Proof has 2 children, both Subtask (base case, inductive step)',
    Array.isArray(proof.children) && proof.children.length === 2 && proof.children[0].kind === 'Subtask' && proof.children[1].kind === 'Subtask',
  );

  const baseCase = (proof.children || [])[0] || {};
  check('Bernoulli', 'base-case subtask: depth=1, title="base case"', baseCase.depth === 1 && baseCase.title === 'base case');
  check('Bernoulli', 'base-case subtask has exactly 1 child: Claim', Array.isArray(baseCase.children) && baseCase.children.length === 1 && baseCase.children[0].kind === 'Claim');

  const claim = (baseCase.children || [])[0] || {};
  check('Bernoulli', 'Claim carries non-empty .tokens (the goal statement)', Array.isArray(claim.tokens) && claim.tokens.length > 0);
  check('Bernoulli', 'Claim.statement is the empty array (filled by later tasks)', Array.isArray(claim.statement) && claim.statement.length === 0);
  check('Bernoulli', 'Claim has exactly 1 child: Statement', Array.isArray(claim.children) && claim.children.length === 1 && claim.children[0].kind === 'Statement');

  const inductiveStep = (proof.children || [])[1] || {};
  check('Bernoulli', 'inductive-step subtask: depth=1, title="inductive step"', inductiveStep.depth === 1 && inductiveStep.title === 'inductive step');
  check(
    'Bernoulli',
    'inductive-step subtask has exactly 3 Statement children (Assume/Then/QED)',
    Array.isArray(inductiveStep.children) && inductiveStep.children.length === 3 && inductiveStep.children.every((c) => c.kind === 'Statement'),
  );
  check(
    'Bernoulli',
    'the 3rd inductive-step statement is exactly WORD:QED',
    arraysEqual(tseq((inductiveStep.children[2] || {}).tokens || []), ['WORD:QED']),
  );

  check('Bernoulli', 'every diagnostic has severity info or warn', diagnostics.every((d) => d.severity === 'info' || d.severity === 'warn'));
  check('Bernoulli', 'no "unclosed scope" diagnostics leaked (document is fully balanced)', !diagnostics.some((d) => d.message.startsWith('unclosed scope')));
  check('Bernoulli', 'no "unmatched }" diagnostics leaked (document is fully balanced)', !diagnostics.some((d) => d.message.startsWith('unmatched }')));

  // (5a) Span assertions: expected line numbers are computed from the
  // BERNOULLI constant itself (not hardcoded), so this stays correct if the
  // fixture text above is ever edited.
  const bernoulliLines = BERNOULLI.split('\n');
  const findLine = (needle, fromLine = 1) => {
    for (let i = fromLine - 1; i < bernoulliLines.length; i++) {
      if (bernoulliLines[i].includes(needle)) return i + 1; // 1-based
    }
    return -1;
  };
  const problemOpenLine = findLine('Problem 3 {');
  const problemCloseLine = bernoulliLines.length; // Problem is the outermost block; its close is the doc's last line
  const theoremOpenLine = findLine('Theorem Bernoulli inequality {');
  const theoremCloseLine = findLine('}', theoremOpenLine + 1); // first bare-close after the theorem opens
  check(
    'Bernoulli',
    'fixture line lookups all resolved (span assertions below are self-computed, not hardcoded)',
    problemOpenLine !== -1 && theoremOpenLine !== -1 && theoremCloseLine !== -1,
  );
  check(
    'Bernoulli',
    `Problem scope span covers the full block (its own line through the doc's closing brace): lines ${problemOpenLine}-${problemCloseLine}`,
    !!problem.span && problem.span.startLine === problemOpenLine && problem.span.endLine === problemCloseLine,
  );
  check(
    'Bernoulli',
    `Theorem scope span covers exactly its own 3 lines: ${theoremOpenLine}-${theoremCloseLine}`,
    !!theorem.span && theorem.span.startLine === theoremOpenLine && theorem.span.endLine === theoremCloseLine && theoremCloseLine - theoremOpenLine + 1 === 3,
  );

  // (5b) Macro span preservation: the macro-expanded WORD:Math / OP:. /
  // WORD:naturals tokens must carry the ORIGINAL (usage-site) WORD:N
  // token's span, not the #define line's own N, and not a synthetic/zero
  // span - so caret lookup through a macro invocation still resolves to the
  // real source location where the macro was USED.
  const rawTokens = lex(BERNOULLI).tokens;
  const usageNIdx = rawTokens.findIndex(
    (t, i) => t.kind === 'WORD' && t.text === 'N' && rawTokens[i - 1] && rawTokens[i - 1].kind === 'WORD' && rawTokens[i - 1].text === 'in',
  );
  const rawNTok = rawTokens[usageNIdx];
  check('Bernoulli', 'raw (pre-expansion) token stream has a usage-site WORD:N ("...in N:...") to compare spans against', !!rawNTok);
  const sameSpan = (a, b) => !!a && !!b && a.startLine === b.startLine && a.startCol === b.startCol && a.endLine === b.endLine && a.endCol === b.endCol;
  const [mathTok, dotTok, naturalsTok] = (theoremStmt.tokens || []).slice(macroExpandedAt, macroExpandedAt + 3);
  check('Bernoulli', 'macro-expanded WORD:Math token carries the original usage-site WORD:N span', sameSpan(mathTok && mathTok.span, rawNTok && rawNTok.span));
  check('Bernoulli', 'macro-expanded OP:. token carries the original usage-site WORD:N span', sameSpan(dotTok && dotTok.span, rawNTok && rawNTok.span));
  check('Bernoulli', 'macro-expanded WORD:naturals token carries the original usage-site WORD:N span', sameSpan(naturalsTok && naturalsTok.span, rawNTok && rawNTok.span));
}

// ============================================
// (b) cases{} multi-line merge: exactly one Statement, exactly one synthetic
// OP:';' inserted between the two branch lines (not at the cases{ open, not
// before the closing }).
// ============================================
{
  const src = 'f(x) = cases {\n  x^2 if x >= 0\n  -x otherwise\n}';
  const { ast } = parse(src);
  check('CasesMultiline', 'produces exactly one top-level Statement block', ast.blocks.length === 1 && ast.blocks[0].kind === 'Statement');

  const stmt = ast.blocks[0] || {};
  const texts = tseq(stmt.tokens || []);
  const semicolons = (stmt.tokens || []).filter((t) => t.kind === 'OP' && t.text === ';');
  check('CasesMultiline', 'exactly one OP:; was synthesized', semicolons.length === 1);

  const semiIdx = texts.indexOf('OP:;');
  check(
    'CasesMultiline',
    'the ; sits between the "x >= 0" branch and the "-x otherwise" branch',
    semiIdx > 0 && texts[semiIdx - 1] === 'NUMBER:0' && texts[semiIdx + 1] === 'OP:-',
  );
  const casesIdx = texts.indexOf('WORD:cases');
  check(
    'CasesMultiline',
    'no ; immediately after the opening WORD:cases LBRACE',
    casesIdx !== -1 && texts[casesIdx + 1] === 'LBRACE:{' && texts[casesIdx + 2] !== 'OP:;',
  );
  check('CasesMultiline', 'tokens start with WORD:cases LBRACE:{ and end with RBRACE:}', texts[0] === 'WORD:f' && texts.includes('WORD:cases') && texts[texts.length - 1] === 'RBRACE:}');
}

// ============================================
// (c) Stray `}` alone -> diagnostic warn + Blank block.
// ============================================
{
  const { ast, diagnostics } = parse('}');
  check('UnmatchedClose', 'produces exactly one Blank block', ast.blocks.length === 1 && ast.blocks[0].kind === 'Blank');
  check(
    'UnmatchedClose',
    'produces a warn diagnostic with message "unmatched } — ignored"',
    diagnostics.some((d) => d.severity === 'warn' && d.message === 'unmatched } — ignored'),
  );
}

// ============================================
// (d) `Problem X {` then EOF -> Scope present + exactly 1 info diagnostic.
// ============================================
{
  const { ast, diagnostics } = parse('Problem X {');
  check(
    'UnclosedScope',
    'Scope(Problem, title X) is present in blocks',
    ast.blocks.some((b) => b.kind === 'Scope' && b.scopeType === 'Problem' && b.title === 'X'),
  );
  const infoDiags = diagnostics.filter((d) => d.severity === 'info');
  check('UnclosedScope', 'exactly 1 info diagnostic', infoDiags.length === 1);
}

// ============================================
// (e) Claim line `?: x = 1 {` -> Claim block with .tokens for "x = 1".
// ============================================
{
  const { ast } = parse('?: x = 1 {');
  check('ClaimOpen', 'first block is a Claim', ast.blocks.length >= 1 && ast.blocks[0].kind === 'Claim');
  const claim = ast.blocks[0] || {};
  check('ClaimOpen', 'Claim.tokens === [WORD:x, OP:=, NUMBER:1]', arraysEqual(tseq(claim.tokens || []), ['WORD:x', 'OP:=', 'NUMBER:1']));
}

// ============================================
// (f) `cases { x }` at line start -> Statement (NOT a Case/Scope) - the
// cases-never-a-scope rule.
// ============================================
{
  const { ast } = parse('cases { x }');
  check('CasesNeverScope', 'produces a single Statement, not a Scope', ast.blocks.length === 1 && ast.blocks[0].kind === 'Statement');
  const texts = tseq((ast.blocks[0] || {}).tokens || []);
  check('CasesNeverScope', 'Statement.tokens === [WORD:cases, LBRACE:{, WORD:x, RBRACE:}]', arraysEqual(texts, ['WORD:cases', 'LBRACE:{', 'WORD:x', 'RBRACE:}']));
}

// ============================================
// (g) Subtask `-- nested title {` -> Subtask depth 2, title 'nested title'.
// ============================================
{
  const { ast } = parse('-- nested title {');
  check('SubtaskDepth', 'produces a single Subtask block', ast.blocks.length === 1 && ast.blocks[0].kind === 'Subtask');
  const subtask = ast.blocks[0] || {};
  check('SubtaskDepth', 'depth === 2 (two consecutive OP:- tokens)', subtask.depth === 2);
  check('SubtaskDepth', 'title === "nested title"', subtask.title === 'nested title');
}

// ============================================
// Supplementary coverage (rule 1: comments/blank lines; rule 5's >4-dash and
// unterminated-brace escape hatches; rule 9's EOF guard) - not individually
// enumerated in the task's (a)-(g) list but each is an explicit rule.
// ============================================

// Rule 1: a comment-only line produces a single Blank block.
{
  const { ast } = parse('// just a comment');
  check('Comments', 'comment-only line -> single Blank block', ast.blocks.length === 1 && ast.blocks[0].kind === 'Blank');
}

// Rule 1 / rule 8: a trailing comment on a statement line is stripped from .tokens.
{
  const { ast } = parse('x = 1 // trailing note');
  const block = ast.blocks[0] || {};
  check(
    'Comments',
    'trailing comment stripped from Statement.tokens',
    ast.blocks.length === 1 && block.kind === 'Statement' && arraysEqual(tseq(block.tokens || []), ['WORD:x', 'OP:=', 'NUMBER:1']),
  );
}

// Rule 1: a purely blank (whitespace-only) line between statements is its own Blank block.
{
  const { ast } = parse('x = 1\n\ny = 2');
  check(
    'Blank',
    'blank line between two statements -> [Statement, Blank, Statement]',
    ast.blocks.length === 3 && ast.blocks[0].kind === 'Statement' && ast.blocks[1].kind === 'Blank' && ast.blocks[2].kind === 'Statement',
  );
}

// Rule 5: more than 4 consecutive dashes is just a statement, not a subtask.
{
  const { ast } = parse('----- x {');
  check(
    'SubtaskDepth',
    '5 consecutive dashes -> plain Statement (not a Subtask)',
    ast.blocks.length === 1 && ast.blocks[0].kind === 'Statement',
  );
}

// Rule 5: dashes not ending in LBRACE is just a statement.
{
  const { ast } = parse('- just a dash statement');
  check(
    'SubtaskDepth',
    'dash line not ending in { -> plain Statement (not a Subtask)',
    ast.blocks.length === 1 && ast.blocks[0].kind === 'Statement',
  );
}

// Rule 9: cases{} that never closes before EOF -> merged Statement + warn diagnostic.
{
  const { ast, diagnostics } = parse('cases {\n  x^2 if x >= 0');
  check('UnclosedCases', 'unclosed cases{} merges to EOF as a single Statement', ast.blocks.length === 1 && ast.blocks[0].kind === 'Statement');
  check(
    'UnclosedCases',
    'diagnostic warn "unclosed cases — merged to end of file" (names the triggering construct)',
    diagnostics.some((d) => d.severity === 'warn' && d.message === 'unclosed cases — merged to end of file'),
  );
}

// Rule 9: unclosed matrix(...) at EOF names 'matrix' in the diagnostic, not 'cases'.
{
  const { ast, diagnostics } = parse('A = matrix([[1, 2]');
  check('UnclosedMatrixEOF', 'unclosed matrix(...) merges to EOF as a single Statement', ast.blocks.length === 1 && ast.blocks[0].kind === 'Statement');
  check(
    'UnclosedMatrixEOF',
    'diagnostic warn "unclosed matrix — merged to end of file" (names matrix, not cases)',
    diagnostics.some((d) => d.severity === 'warn' && d.message === 'unclosed matrix — merged to end of file'),
  );
}

// Rule 4: scope-name matching is case-insensitive.
{
  const { ast } = parse('theorem Foo {\n}');
  check(
    'ScopeCaseInsensitive',
    'lowercase "theorem" still matches the Theorem scope',
    ast.blocks.length === 1 && ast.blocks[0].kind === 'Scope' && ast.blocks[0].scopeType === 'Theorem' && ast.blocks[0].title === 'Foo',
  );
}

// ============================================
// Review-fix coverage: empty #define must not register/erase a macro;
// matrix(...) multiline merge inserts NO synthetic ';' (unlike cases{});
// scope-title dot cleanup is targeted to MATH_PACKAGE names only.
// ============================================

// (5c) `A = bmatrix([[1, 2],\n[3, 4]])` merges to ONE Statement, and unlike
// cases{} merge, NO synthetic ';' is ever inserted for a matrix trigger.
{
  const src = 'A = bmatrix([[1, 2],\n[3, 4]])';
  const { ast } = parse(src);
  check('MatrixMultiline', 'produces exactly one top-level Statement block', ast.blocks.length === 1 && ast.blocks[0].kind === 'Statement');
  const stmt = ast.blocks[0] || {};
  const texts = tseq(stmt.tokens || []);
  check('MatrixMultiline', 'no synthetic ; inserted (only cases{} gets one, not matrix(...))', !texts.includes('OP:;'));
  check(
    'MatrixMultiline',
    'tokens are the two lines concatenated verbatim: starts WORD:A, includes WORD:bmatrix, ends RPAREN:)',
    texts[0] === 'WORD:A' && texts.includes('WORD:bmatrix') && texts[texts.length - 1] === 'RPAREN:)',
  );
}

// (5d) `#define N` (empty replacement) must NOT register a macro - a later
// bare `N` must pass through untouched, with exactly one warn diagnostic.
{
  const { ast, diagnostics } = parse('#define N\nN + 1');
  check(
    'EmptyDefine',
    'blocks are exactly [Blank (the #define line), Statement (N + 1)]',
    ast.blocks.length === 2 && ast.blocks[0].kind === 'Blank' && ast.blocks[1].kind === 'Statement',
  );
  const stmt = ast.blocks[1] || {};
  const texts = tseq(stmt.tokens || []);
  check('EmptyDefine', 'statement still contains WORD:N (macro NOT registered, nothing erased)', texts.includes('WORD:N'));
  check('EmptyDefine', 'macros table does NOT contain N', !Object.prototype.hasOwnProperty.call(ast.macros, 'N'));
  const warnDiags = diagnostics.filter((d) => d.severity === 'warn');
  check('EmptyDefine', 'exactly 1 warn diagnostic', warnDiags.length === 1);
  check(
    'EmptyDefine',
    'diagnostic message is "#define N has no replacement — ignored"',
    warnDiags[0] && warnDiags[0].message === '#define N has no replacement — ignored',
  );
}

// (5e) `Problem 1. Basics {` -> title "1. Basics": an ordinary sentence
// period keeps its trailing space (only a MATH_PACKAGE name like
// `Math.naturals` collapses the space around the dot).
{
  const { ast } = parse('Problem 1. Basics {');
  check(
    'ScopeTitlePeriod',
    'Scope(Problem) title is "1. Basics" (sentence period keeps its space, unlike a MATH_PACKAGE name)',
    ast.blocks.length === 1 && ast.blocks[0].kind === 'Scope' && ast.blocks[0].title === '1. Basics',
  );
}

// ============================================
// Quality-review round 2: macro tokens preserved verbatim (not re-lexed);
// ';' synthesis keyed on the innermost open frame (not the whole-merge
// trigger); the merge gate never engages for a generic unbalanced paren;
// EOF diagnostics for Subtask/Claim; nested-Subtask depth tracking.
// ============================================

// Proves fix 1: a string-valued macro's quotes must survive expansion. Under
// the old join-text-then-re-lex implementation, `"by induction"` lost its
// quotes (STRING.text is inner-only) and was re-lexed back as two bare WORD
// tokens - the STRING kind never came back. Storing the already-lexed
// replacement Token[] verbatim fixes this.
{
  const { ast } = parse('#define note "by induction"\nThen note done');
  check(
    'MacroString',
    'blocks are exactly [Blank (the #define line), Statement]',
    ast.blocks.length === 2 && ast.blocks[0].kind === 'Blank' && ast.blocks[1].kind === 'Statement',
  );
  const stmt = ast.blocks[1] || {};
  check(
    'MacroString',
    'Statement.tokens === [WORD:Then, STRING:by induction, WORD:done] (macro-expanded STRING token, quotes-content intact)',
    arraysEqual(tseq(stmt.tokens || []), ['WORD:Then', 'STRING:by induction', 'WORD:done']),
  );
  check('MacroString', 'the expanded token really is kind STRING (not WORD/WORD from a re-lexed join)', (stmt.tokens || []).some((t) => t.kind === 'STRING' && t.text === 'by induction'));
  check('MacroString', 'macros.note display value is still the joined text "by induction"', ast.macros.note === 'by induction');
}

// Proves fix 2: a matrix(...) literal spanning multiple lines *inside* a
// multi-line cases{} must not get a synthetic ';' spliced into its own
// argument list. The ';' insertion must look at the INNERMOST open bracket
// frame at each line boundary, not the outer 'cases' trigger that gated
// entry into the merge in the first place.
{
  const src = 'cases {\n  y = matrix([[1,\n  2]])\n  z otherwise\n}';
  const { ast } = parse(src);
  check('NestedMatrixInCases', 'produces exactly one top-level Statement block', ast.blocks.length === 1 && ast.blocks[0].kind === 'Statement');
  const stmt = ast.blocks[0] || {};
  const texts = tseq(stmt.tokens || []);
  const semicolons = (stmt.tokens || []).filter((t) => t.kind === 'OP' && t.text === ';');
  check('NestedMatrixInCases', 'exactly one OP:; was synthesized (one per cases-body boundary, not one per absorbed line)', semicolons.length === 1);

  const matrixIdx = texts.indexOf('WORD:matrix');
  const closeParenIdx = texts.indexOf('RPAREN:)');
  const insideMatrix = texts.slice(matrixIdx, closeParenIdx + 1);
  check(
    'NestedMatrixInCases',
    'no ; anywhere inside the matrix(...) call itself (between WORD:matrix and its closing RPAREN) - the corrupt-args bug',
    matrixIdx !== -1 && closeParenIdx !== -1 && !insideMatrix.includes('OP:;'),
  );
  check(
    'NestedMatrixInCases',
    'the matrix args are untouched: ...NUMBER:1 OP:, NUMBER:2... survives as one contiguous run',
    insideMatrix.join('|').includes('NUMBER:1|OP:,|NUMBER:2'),
  );

  const semiIdx = texts.indexOf('OP:;');
  check(
    'NestedMatrixInCases',
    'the ; sits right after the matrix(...) call closes (RPAREN) and right before the next case branch (WORD:z) - back at the cases-body top level',
    semiIdx > 0 && texts[semiIdx - 1] === 'RPAREN:)' && texts[semiIdx + 1] === 'WORD:z',
  );
}

// Item 3: the merge gate itself must key on the OUTERMOST trigger of the
// FIRST line's own imbalance - a plain unbalanced '(' with no cases/matrix
// trigger anywhere must never engage the multi-line merge/absorb machinery,
// no matter how the innermost-frame check inside the merge loop is written.
{
  const { ast } = parse('f(x = 1\ny = 2');
  check(
    'MergeGateNegative',
    'unbalanced "(" with no cases/matrix trigger must NOT merge across lines: stays TWO Statement blocks',
    ast.blocks.length === 2 && ast.blocks[0].kind === 'Statement' && ast.blocks[1].kind === 'Statement',
  );
  check(
    'MergeGateNegative',
    'first Statement.tokens === [WORD:f, LPAREN:(, WORD:x, OP:=, NUMBER:1] (line 1 only, not absorbing line 2)',
    arraysEqual(tseq((ast.blocks[0] || {}).tokens || []), ['WORD:f', 'LPAREN:(', 'WORD:x', 'OP:=', 'NUMBER:1']),
  );
  check(
    'MergeGateNegative',
    'second Statement.tokens === [WORD:y, OP:=, NUMBER:2]',
    arraysEqual(tseq((ast.blocks[1] || {}).tokens || []), ['WORD:y', 'OP:=', 'NUMBER:2']),
  );
}

// Item 6a: unclosed `- subtask {` at EOF -> Subtask still returned + exactly
// 1 info diagnostic "unclosed subtask".
{
  const { ast, diagnostics } = parse('- subtask {');
  check(
    'UnclosedSubtask',
    'Subtask(depth 1, title "subtask") is present in blocks',
    ast.blocks.some((b) => b.kind === 'Subtask' && b.depth === 1 && b.title === 'subtask'),
  );
  const infoDiags = diagnostics.filter((d) => d.severity === 'info');
  check(
    'UnclosedSubtask',
    'exactly 1 info diagnostic, message "unclosed subtask"',
    infoDiags.length === 1 && infoDiags[0].message === 'unclosed subtask',
  );
}

// Item 6b: unclosed `?: x {` -> Claim still returned + exactly 1 info
// diagnostic "unclosed claim".
{
  const { ast, diagnostics } = parse('?: x {');
  check('UnclosedClaim', 'Claim is present in blocks', ast.blocks.some((b) => b.kind === 'Claim'));
  const infoDiags = diagnostics.filter((d) => d.severity === 'info');
  check(
    'UnclosedClaim',
    'exactly 1 info diagnostic, message "unclosed claim"',
    infoDiags.length === 1 && infoDiags[0].message === 'unclosed claim',
  );
}

// Item 6c: nesting - `- outer {` containing `-- inner {` containing a plain
// statement -> Subtask depth 1 containing Subtask depth 2 containing
// Statement, both closing cleanly (no unclosed diagnostics).
{
  const { ast, diagnostics } = parse('- outer {\n-- inner {\nx\n}\n}');
  check(
    'NestedSubtasks',
    'top level is exactly one Subtask (depth 1, title "outer")',
    ast.blocks.length === 1 && ast.blocks[0].kind === 'Subtask' && ast.blocks[0].depth === 1 && ast.blocks[0].title === 'outer',
  );
  const outer = ast.blocks[0] || {};
  check(
    'NestedSubtasks',
    'outer has exactly 1 child: Subtask (depth 2, title "inner")',
    Array.isArray(outer.children) && outer.children.length === 1 && outer.children[0].kind === 'Subtask' && outer.children[0].depth === 2 && outer.children[0].title === 'inner',
  );
  const inner = (outer.children || [])[0] || {};
  check(
    'NestedSubtasks',
    'inner has exactly 1 child: Statement with tokens === [WORD:x]',
    Array.isArray(inner.children) && inner.children.length === 1 && inner.children[0].kind === 'Statement' && arraysEqual(tseq(inner.children[0].tokens || []), ['WORD:x']),
  );
  check(
    'NestedSubtasks',
    'both subtasks closed cleanly (no "unclosed subtask" diagnostics leaked)',
    !diagnostics.some((d) => d.message === 'unclosed subtask'),
  );
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
