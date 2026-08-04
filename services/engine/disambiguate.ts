// MathBrain Engine v2 - Disambiguator (Stage 3 of the pipeline: lexer ->
// document -> DISAMBIGUATOR -> expression parser -> renderer).
//
// This is where the product promise lives: "words near words are English,
// letters near numbers are math". Given ONE statement's tokens (document.ts
// has already stripped NEWLINE/COMMENT) it partitions them into ordered
// prose/math runs - the renderer wraps prose runs in \text{...} and feeds
// math runs to parseExpression().
//
// Two-tier decision procedure:
//   A. ABSOLUTES - context or vocabulary settles it with no arithmetic
//      (a STRING is text, `forall` is math, `the` is English, `f(` is a call).
//   B. SCORING - everything genuinely ambiguous (single letters, `and`/`or`/
//      `not`/`in`, `a`/`A`, unknown words, bare function keywords) accumulates
//      weighted features from its neighbourhood. score > 0 -> math,
//      score <= 0 -> prose. EVERY number used lives in the WEIGHTS table
//      below, and every fired feature is recorded on the DecisionRecord as
//      `name(±w)`, so a verdict can always be explained (and retuned) without
//      reading this file.
//
// Scoring is deliberately ORDER-INDEPENDENT: features look at the STATIC
// class of neighbours (what the tables say about them), never at verdicts
// already produced for other words. One word's decision can therefore never
// cascade into its neighbour's, which keeps the table tunable.

import type { Token, Diagnostic, Span } from './types';
import { GREEK, SYMBOL_MAP, MATH_KEYWORDS, STOP_WORDS, FUNCTIONS } from './language';

// ---- Public API ----
export interface DecisionRecord { word: string; span: Span; verdict: 'prose' | 'math'; score: number; reasons: string[] }
export interface Run { kind: 'prose' | 'math'; tokens: Token[] }

type Verdict = 'prose' | 'math';
// Static class of a token as the TABLES see it: 'math'/'prose' are decided,
// 'ambiguous' means "only scoring can say".
type StaticClass = Verdict | 'ambiguous';

// ---- The single tunable table ----
// Every name `fire()` is ever called with, spelled out so a typo'd feature
// name is a compile error instead of a silent `undefined` weight.
type Feature =
  | 'singleLetter' | 'indexedVar' | 'bareKeyword' | 'unknownMultiChar'
  | 'neighborProse' | 'neighborMathy' | 'commaBefore' | 'quantifierContext'
  | 'articleA' | 'binderBefore' | 'inMembership' | 'inProse'
  | 'proseSentence' | 'formulaSentence' | 'symbolWord';

// Positive pulls toward math, negative toward prose. Retuning the classifier
// means editing these numbers and nothing else.
export const WEIGHTS: Record<Feature, number> = {
  singleLetter: 5,        // `x`, `f`, `L` - the canonical variable shape, and strong
                          //   enough to survive English on BOTH sides ("f is continuous")
  indexedVar: 5,          // `x1`, `a2` - a letter with a digit tail is still a variable
  bareKeyword: 2,         // a FUNCTIONS name used without parens (`sum`, `lim`)
  unknownMultiChar: -3,   // a multi-character word in no table at all ("rules")
  neighborProse: -2,      // per side: nearest neighbour reads as English
  neighborMathy: 2,       // per side: nearest neighbour is a number/letter/symbol/math operator
  commaBefore: -3,        // ", and ..." - the Oxford comma is an English tell (connectives only:
                          //   the comma in `[a, b]` or `choose(n, k)` means nothing of the sort)
  quantifierContext: 3,   // a quantified/implication statement, between two single letters
  articleA: -4,           // `a`/`A` used as the English article ("a big number")
  binderBefore: 3,        // "Let x", "Assume n" - a binder introduces a variable
  inMembership: 3,        // `x in A` - set membership
  inProse: -3,            // "included in the set" - the English preposition
  proseSentence: -5,      // and/or/not inside a sentence that contains English words
  formulaSentence: 2,     // and/or/not inside a statement with no English at all
  symbolWord: 2,          // a PROSE_COLLIDING_SYMBOLS name (`partial`): enough that the word
                          //   ALONE (`partial`) or beside any notation still reads as its
                          //   symbol, and little enough that English on either side outvotes it
};

// Absolutes do not score; they get a finite sentinel so DecisionRecord.score
// stays a plain sortable number (±Infinity prints badly in the explain table).
const ABSOLUTE_SCORE = 100;

// ---- Word sets that only the disambiguator needs ----

// Words that appear in a math table but are ALSO ordinary English, so they can
// never be decided by vocabulary alone.
const AMBIGUOUS = new Set(['and', 'or', 'not', 'in', 'a', 'A']);

// Math-table words that are ALSO ordinary English adjectives/nouns, so table
// membership alone must not settle them - the same judgement the BARE-CALLABLE
// carve-out makes for `sum`/`lim` (which reach scoring only because they are
// FUNCTIONS names; these are not, so they need naming here).
//
// `partial` is the live case: "the partial sums stay bounded", "the partial
// order on S", "we compute the partial fraction decomposition" are ordinary
// analysis/algebra prose, and an absolute verdict printed a ∂ into the middle
// of the sentence (`\text{the }\partial\text{ sums stay bounded}`) with no
// diagnostic. Scoring reads the neighbourhood instead, which is decisive in
// both directions: every PDE spelling puts notation next to it (`partial u`,
// `partial^2`, `/partial x`, `= partial`), and every prose use puts English
// there.
//
// The geometry keywords `triangle`/`angle`/`parallel`/`degree`/`congruent`
// have the same collision ("the triangle inequality", "the parallel
// postulate") but are NOT listed: their math spellings take multi-char
// operands that score as prose (`angle ABC`, `triangle PQR`), so scoring would
// trade one silent error for another. They need point-label support first.
const PROSE_COLLIDING_SYMBOLS = new Set(['partial']);

// The subset whose reading is a property of the whole sentence rather than of
// its immediate neighbours: `Let a and b be reals` (English) vs `p and q => r`
// (logic) have identical local shapes. `in` is deliberately NOT here - its own
// inMembership/inProse features read the local shape decisively enough, and a
// sentence frame would wrongly drag `x in (a,b)` out of `Then F'(x) = ... x in (a,b)`.
const CONNECTIVES = new Set(['and', 'or', 'not']);

// "Let x", "Assume n", "Show f" - the word after one of these is the thing
// being introduced, which for a single letter means a variable.
const BINDERS = new Set([
  'let', 'assume', 'suppose', 'define', 'denote', 'consider', 'take', 'fix', 'given',
  'show', 'prove', 'find', 'determine', 'solve', 'compute', 'calculate', 'verify',
]);

// Statement-initial glue words ("Then p and q => r", "Assume x in A ...").
// These read as English on their own, but unlike a real English lead-in they
// say nothing about whether the REST of the sentence is prose - so they must
// not be allowed to poison hasProse for the whole statement (see buildContext).
// Only the first word-token of a statement is ever checked against this set.
// `let` belongs here for the same reason `assume`/`suppose` (already listed)
// do: all three are BINDERS - they introduce the symbols that follow rather
// than describing them, so "Let p and q be given" is no more evidence that the
// rest of the line is English than "Assume p and q" is.
const DISCOURSE_MARKERS = new Set([
  'let', 'then', 'so', 'hence', 'thus', 'therefore', 'assume', 'suppose', 'note', 'recall', 'consider', 'clearly', 'since', 'because',
]);

// Auxiliary/copula verbs. When one of these follows `a`/`A`, the word is being
// predicated ("Let a BE a real number") rather than modifying a noun, so the
// articleA override below must not fire - this is what separates "Let a be a
// real number" (first `a`: variable) from "Suppose a sequence converges" /
// "Find a real number x" (both: `a` is the English article, binder or not).
// Deliberately a separate, smaller set from language.ts's STOP_WORDS (which
// also lists be/is/are/have/... among many other English words that have
// nothing to do with predication): STOP_WORDS answers "does this word read
// as English" for absolute classification; AUX_VERBS answers the narrower
// "is this SPECIFICALLY an auxiliary/copula verb" for the articleA veto.
// Same overlap-but-different-job relationship as VERB_FUNCTIONS below.
const AUX_VERBS = new Set([
  'be', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'does', 'do',
  'can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should',
]);

// FUNCTIONS names that are ALSO common English verbs. Used bare (no parens),
// the English reading is at least as likely as the math one ("we choose x in
// A", "we show that...", "we find a counterexample", "note that..."), so
// bareKeyword must not fire for them - they fall through to unknownMultiChar
// like any other ordinary word and let the neighbourhood decide instead.
// (`show`/`find` are additionally absolute STOP_WORDS and never reach this
// check at all; `note` is not a FUNCTIONS name. All four are kept here
// together because this set is the definitive list of verb/function-name
// collisions this file resolves in favour of scoring, not table membership -
// only `choose` is a live branch today, but the list documents the intent
// for the other three too.) A real call - `choose(n, k)` - is unaffected: it
// is decided by the call-form absolute before scoring ever runs.
const VERB_FUNCTIONS = new Set(['choose', 'show', 'find', 'note']);

// OP texts that read as mathematics when they sit next to an ambiguous word.
const MATH_OPS = new Set(['=', '+', '-', '*', '/', '^', '_', '<', '>', '<=', '>=', '!=', '->', '=>', '<=>', '+-', '-+', '|', "'"]);

// Sentence-level evidence for quantifierContext. `in` and `subset` are
// deliberately NOT here, even though both are otherwise-unambiguous relation
// words (see RELATION_WORDS in language.ts): `in`'s own inMembership/inProse
// features already read its local shape decisively (see the `w === 'in'`
// block below), and both routinely show up ONCE inside an otherwise
// prose-heavy sentence ("Let A be a subset of B, and suppose x and y are
// elements...", "x in the following section") - letting either flip
// hasQuantifier for the WHOLE statement would be blanket in-evidence that
// over-triggers the quantifierContext bonus for unrelated ambiguous words
// elsewhere in that same sentence. `implies`/`iff`, by contrast, are used
// exclusively in already-formal quantified/logical constructions, so their
// mere presence is safe to treat as sentence-wide evidence of a formula.
const QUANTIFIER_WORDS = new Set(['forall', 'exists', 'suchthat', 'notin', 'implies', 'iff']);
const QUANTIFIER_OPS = new Set(['=>', '<=>']);

// Punctuation that belongs to whichever side it separates rather than to a
// run of its own (see attachPunctuation). '!' is here for the same reason
// '.' is: it is the factorial operator next to mathematics (`(j-1)!`) and an
// exclamation mark next to English ("which is what we wanted!"), and
// attachPunctuation reads exactly that neighbourhood.
const ATTACHING_OPS = new Set([',', '.', ';', ':', '!']);

const isSingleLetter = (w: string): boolean => w.length === 1 && /[A-Za-z]/.test(w);
const isIndexedVar = (w: string): boolean => /^[A-Za-z][0-9]+$/.test(w);
const isUpperLetter = (w: string): boolean => w.length === 1 && w >= 'A' && w <= 'Z';
const isMathTableWord = (w: string): boolean => GREEK[w] !== undefined || MATH_KEYWORDS.has(w) || SYMBOL_MAP[w] !== undefined;
const isAttaching = (t: Token): boolean => t.kind === 'PUNCT' || (t.kind === 'OP' && ATTACHING_OPS.has(t.text));

// ---- Per-statement context, computed once ----

/** The bracket facts the CONTEXT ABSOLUTES read (absoluteOf, staticClassOf).
 *  Split out of Context because buildContext has to compute the static classes
 *  while it is still building the Context object itself. */
interface ParenFacts {
  inCallArgs: boolean[];     // token sits inside the parens of a function call
  inScriptArgs: boolean[];   // token sits inside a `_(`/`^(` script argument
  callParens: Set<number>;   // LPAREN/LBRACE indices that open a function call (see computeCallParens)
}

interface Context extends ParenFacts {
  tokens: Token[];
  classes: StaticClass[];    // static class of every token
  matchingParen: number[];   // opener index (LPAREN or LBRACE) -> its closer index, else -1
  hasProse: boolean;         // statement contains at least one English-reading word
  hasQuantifier: boolean;    // statement contains forall/exists/suchthat/notin/=>/<=>
}

// A call is `WORD ['...] (`: `sum(`, `f(`, `F'(`, `Im(`, `Aut(`. `cases {`
// counts too: its body is a math environment, keywords and all (`v if c; v2
// otherwise`).
//
// Everything except a FUNCTIONS name requires SPAN adjacency all the way to
// the paren (no whitespace anywhere in `a(`/`F'(`/`Im(`) - that is the whole
// discriminator against the other reading of `word (`, an English sentence
// ending in a parenthetical: "We have a (possibly empty) set", "the set (a,
// b)" - a remark is written with a space, an application without one. It is
// what lets an unknown multi-char name like `Im(f)`, `Aut(G)` or `Var(X)` be
// the call it plainly is instead of a prose word followed by a stranded
// group - and a stranded group is not merely ugly: the run boundary it opens
// leaves the bracket (or the `|` around it) alone in its own math run, where
// it parses as Raw. FUNCTIONS names stay lenient about spacing (`sin (x)` is
// still a call): they are never ordinary English words, so there is no
// parenthetical-remark reading to protect.
//
// A word in STOP_WORDS is never a call name however it is spaced - `if(x >
// 0)` and `no(such x)` are English with a tight parenthesis, not
// applications - so the vocabulary keeps its say over the one shape where
// adjacency alone would be wrong.
//
// Adjacency alone is not enough for a MULTI-CHAR unknown name, though: plenty
// of English is typed without the space, and the callee is then an ordinary
// verb with a parenthetical glued to it - `Note(this is important)`,
// `we get(assuming x > 0)`. Reading those as applications produced
// `\mathrm{Note}(\mathrm{this}\mathrm{is}\mathrm{important})`: every word of
// the remark dragged into math and jammed together. So a multi-char unknown
// name additionally has to have a MATH-LOOKING argument list (see
// parenHoldsProse). Single letters and FUNCTIONS names are exempt: `a(n)`,
// `F'(area)` and `sin (x)` have no competing English reading worth the check.
const isAdjacent = (a: Token, b: Token): boolean => a.span.endLine === b.span.startLine && a.span.endCol === b.span.startCol;

// The RPAREN matching the LPAREN at `open`, or -1. A local scan because this
// runs WHILE the call-paren set is being computed - buildContext's
// matchingParen does not exist yet.
function matchingRParen(tokens: Token[], open: number): number {
  let depth = 0;
  for (let k = open; k < tokens.length; k++) {
    if (tokens[k].kind === 'LPAREN') depth++;
    else if (tokens[k].kind === 'RPAREN' && --depth === 0) return k;
  }
  return -1;
}

// Does the group opened at `open` read as English rather than as an argument
// list? True as soon as ONE word in it is English on the tables alone: a
// STOP_WORD, or a multi-character word in no math table. The test is
// deliberately PURELY LEXICAL - no scoring, no verdicts - because it runs
// from inside callOpenerOf, which the scorer's own context is built on; a
// recursive answer here would be a cycle.
//
// A word written tight against its own `(` is skipped: it is a nested callee
// (`Aut(Gal(K))`), not a word of a remark.
function parenHoldsProse(tokens: Token[], open: number): boolean {
  const close = matchingRParen(tokens, open);
  if (close < 0) return false;
  for (let k = open + 1; k < close; k++) {
    const t = tokens[k];
    if (t.kind !== 'WORD') continue;
    const next = tokens[k + 1];
    if (next && next.kind === 'LPAREN' && isAdjacent(t, next)) continue;
    if (STOP_WORDS.has(t.text.toLowerCase())) return true;
    if (isSingleLetter(t.text) || isIndexedVar(t.text)) continue;
    if (isMathTableWord(t.text) || FUNCTIONS[t.text] !== undefined) continue;
    if (isMathPackageMember(tokens, k)) continue;
    return true;
  }
  return false;
}

function callOpenerOf(tokens: Token[], wordIndex: number): number {
  const w = tokens[wordIndex];
  if (!w || w.kind !== 'WORD') return -1;
  const isFunction = FUNCTIONS[w.text] !== undefined;
  if (!isFunction && STOP_WORDS.has(w.text.toLowerCase())) return -1;
  let k = wordIndex + 1;
  let prev = w;
  while (tokens[k] && tokens[k].kind === 'OP' && tokens[k].text === "'") {
    if (!isFunction && !isAdjacent(prev, tokens[k])) return -1;
    prev = tokens[k];
    k++;
  }
  const opener = tokens[k];
  if (!opener) return -1;
  if (!isFunction && !isAdjacent(prev, opener)) return -1;
  if (opener.kind === 'LBRACE') return isFunction ? k : -1;
  if (opener.kind !== 'LPAREN') return -1;
  // The prose-argument veto, for unknown multi-char names only (see above).
  if (!isFunction && !isSingleLetter(w.text) && parenHoldsProse(tokens, k)) return -1;
  return k;
}

// Precomputed ONCE per statement: every LPAREN/LBRACE index some word's
// callOpenerOf resolves to. absoluteOf ("does WORD i open a call") and
// buildContext ("does THIS paren open a call, so its contents are
// inCallArgs") must agree on the same answer - previously buildContext
// re-derived the fact by looking one token back from the paren, which
// desynced from callOpenerOf whenever a prime sat between the word and the
// paren (`F'(area)`: the token immediately before `(` is `'`, not `F`),
// shattering the call's argument list back into prose.
function computeCallParens(tokens: Token[]): Set<number> {
  const parens = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'WORD') continue;
    const p = callOpenerOf(tokens, i);
    if (p >= 0) parens.add(p);
  }
  return parens;
}

// `Math.reals` lexes as WORD OP('.') WORD; the member must not be torn out of
// the formula just because "reals" is in no table.
// Unknown members (`Math.foo`) count too: splitting the run would be worse
// than rendering an unknown identifier.
const isMathPackageMember = (tokens: Token[], i: number): boolean =>
  !!tokens[i - 2] && tokens[i - 2].kind === 'WORD' && tokens[i - 2].text === 'Math' &&
  !!tokens[i - 1] && tokens[i - 1].kind === 'OP' && tokens[i - 1].text === '.';

const isScriptOp = (t: Token | undefined): boolean =>
  t !== undefined && t.kind === 'OP' && (t.text === '_' || t.text === '^');

// A word directly after `_` or `^` is a script operand (`x_max`), never prose.
const isScriptOperand = (tokens: Token[], i: number): boolean => isScriptOp(tokens[i - 1]);

// `x_(ij)`, `x^(a+b)`: the PARENTHESIZED spelling of the same script operand.
// The parens are the script's own grouping - the sub/superscript is what is
// between them - so their contents are math for exactly the reason `x_max`'s
// are. Without this the words inside could score prose, and attachParentheticals
// would then read the group as a remark and hand the whole thing to the
// surrounding text: `x_(ij)` came out as a SILENT empty subscript,
// `x_{}\text{(ij)}`, with the `_` left holding nothing and no diagnostic at all.
const isScriptParen = (tokens: Token[], i: number): boolean =>
  tokens[i].kind === 'LPAREN' && isScriptOp(tokens[i - 1]);

// Step A. Returns null when the word must be scored.
function absoluteOf(tokens: Token[], i: number, facts: ParenFacts): { verdict: Verdict; reason: string } | null {
  const { inCallArgs, inScriptArgs, callParens } = facts;
  const w = tokens[i].text;

  // Context absolutes first: they outrank vocabulary (`a(x)` is a call even
  // though `a` is normally the English article). Reads the SAME callParens
  // set buildContext used to compute inCallArgs (see computeCallParens).
  if (callParens.has(callOpenerOf(tokens, i))) return { verdict: 'math', reason: 'absolute: call form' };
  if (inCallArgs[i]) return { verdict: 'math', reason: 'absolute: function argument' };
  if (isMathPackageMember(tokens, i)) return { verdict: 'math', reason: 'absolute: Math.* member' };
  if (isScriptOperand(tokens, i)) return { verdict: 'math', reason: 'absolute: script operand' };
  if (inScriptArgs[i]) return { verdict: 'math', reason: 'absolute: script argument' };

  // Vocabulary absolutes.
  if (AMBIGUOUS.has(w)) return null;
  // BARE-CALLABLE carve-out: `sum`/`lim`/`sin` without parens are English as
  // often as they are math ("we use the sum and product rules"), so they are
  // scored (bareKeyword) instead of being math by keyword membership.
  if (FUNCTIONS[w] !== undefined) return null;
  // Same carve-out, for table words that are not FUNCTIONS names (see
  // PROSE_COLLIDING_SYMBOLS). Must precede the GREEK check: `partial` is in
  // BOTH tables and the greek-letter absolute is what used to claim it.
  if (PROSE_COLLIDING_SYMBOLS.has(w)) return null;
  if (GREEK[w] !== undefined) return { verdict: 'math', reason: 'absolute: greek letter' };
  if (MATH_KEYWORDS.has(w)) return { verdict: 'math', reason: 'absolute: math keyword' };
  if (SYMBOL_MAP[w] !== undefined) return { verdict: 'math', reason: 'absolute: math symbol' };
  // Stop words are matched case-insensitively so a sentence-initial "Let"/"The"
  // reads the same as mid-sentence "let"/"the" (math tables above stay
  // case-SENSITIVE: `Delta` and `delta` are different symbols).
  if (STOP_WORDS.has(w.toLowerCase())) return { verdict: 'prose', reason: 'absolute: stop word' };
  return null;
}

// What the tables alone say about a token - used by neighbour features and by
// the sentence-level prose test. Unknown multi-char words report 'prose' here
// (that is their leaning) even though they are still scored individually.
function staticClassOf(tokens: Token[], i: number, facts: ParenFacts): StaticClass {
  const t = tokens[i];
  if (t.kind === 'STRING') return 'prose';
  if (t.kind !== 'WORD') return 'math';
  const abs = absoluteOf(tokens, i, facts);
  if (abs) return abs.verdict;
  const w = t.text;
  if (AMBIGUOUS.has(w) || isSingleLetter(w) || isIndexedVar(w) || FUNCTIONS[w] !== undefined) return 'ambiguous';
  // Not 'prose': these are scored, but they are still symbols, so they must
  // neither vouch as English for a neighbour nor set the statement's hasProse.
  if (PROSE_COLLIDING_SYMBOLS.has(w)) return 'ambiguous';
  return 'prose';
}

function buildContext(tokens: Token[]): Context {
  const n = tokens.length;
  const callParens = computeCallParens(tokens);
  const scriptParens = new Set<number>();
  for (let i = 0; i < n; i++) if (isScriptParen(tokens, i)) scriptParens.add(i);
  const inCallArgs = new Array<boolean>(n).fill(false);
  const inScriptArgs = new Array<boolean>(n).fill(false);
  const matchingParen = new Array<number>(n).fill(-1);
  const stack: { index: number; kind: 'LPAREN' | 'LBRACE'; isCall: boolean; isScriptArg: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    if (t.kind === 'LPAREN' || t.kind === 'LBRACE') {
      // Reads the SAME callParens set absoluteOf uses (see computeCallParens) -
      // previously this re-derived "does this paren open a call" by checking
      // whether the token one back was the opening WORD, which missed `F'(`
      // (the token one back is `'`, not `F`).
      const opensCall = callParens.has(i);
      const top = stack[stack.length - 1];
      // Nested groups inherit: `sin(2*(x+1))` is all argument, and everything
      // under `x^(...)` is all script argument.
      stack.push({
        index: i,
        kind: t.kind,
        isCall: opensCall || (top !== undefined && top.isCall),
        isScriptArg: scriptParens.has(i) || (top !== undefined && top.isScriptArg),
      });
    } else if (t.kind === 'RPAREN' || t.kind === 'RBRACE') {
      // A closer that does not match the open frame is left unpaired rather
      // than popping someone else's frame (recovery on malformed input).
      const open = stack[stack.length - 1];
      if (open && ((open.kind === 'LPAREN' && t.kind === 'RPAREN') || (open.kind === 'LBRACE' && t.kind === 'RBRACE'))) {
        stack.pop();
        // Braces are recorded too (attachSetBuilders needs them); every reader
        // of this array checks the OPENER's kind first, so the two bracket
        // families cannot be confused for one another.
        matchingParen[open.index] = i;
      }
    } else if (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.isCall) inCallArgs[i] = true;
      if (top.isScriptArg) inScriptArgs[i] = true;
    }
  }

  const facts: ParenFacts = { inCallArgs, inScriptArgs, callParens };
  const classes = tokens.map((_, i) => staticClassOf(tokens, i, facts));
  // A statement-INITIAL discourse marker ("Then p and q => r") does not count
  // as the sentence's own prose evidence - only the very first word-token is
  // ever exempt, so "Hence a and b are nonzero" still reads as prose (the
  // "are nonzero" tail earns that verdict on its own).
  const firstWordIndex = tokens.findIndex((t) => t.kind === 'WORD');
  const hasProse = tokens.some((t, i) => {
    if (t.kind !== 'WORD' || classes[i] !== 'prose') return false;
    if (i === firstWordIndex && DISCOURSE_MARKERS.has(t.text.toLowerCase())) return false;
    return true;
  });
  const hasQuantifier = tokens.some((t) =>
    (t.kind === 'WORD' && QUANTIFIER_WORDS.has(t.text)) || (t.kind === 'OP' && QUANTIFIER_OPS.has(t.text)));
  return { tokens, classes, ...facts, matchingParen, hasProse, hasQuantifier };
}

// ---- Neighbour helpers ----

// Nearest token in `dir`, looking THROUGH `,` and `.` (commaBefore scores the
// comma separately, and `.` is either sentence punctuation or already part of
// a NUMBER/Math.* form). -1 when there is none.
function neighborIndex(tokens: Token[], i: number, dir: 1 | -1): number {
  for (let j = i + dir; j >= 0 && j < tokens.length; j += dir) {
    const t = tokens[j];
    if (t.kind === 'OP' && (t.text === ',' || t.text === '.')) continue;
    return j;
  }
  return -1;
}

// Nearest WORD token in `dir` (used by the features that ask "what word is on
// this side", ignoring operators and brackets entirely).
function neighborWord(tokens: Token[], i: number, dir: 1 | -1): Token | null {
  for (let j = i + dir; j >= 0 && j < tokens.length; j += dir) {
    if (tokens[j].kind === 'WORD') return tokens[j];
  }
  return null;
}

// The index the articleA check (below) should treat as "the token right
// after `a`/`A`": skips an immediately-following NON-CALL parenthetical
// aside entirely, since "a (possibly empty) set" reads the same as "a set" -
// the noun the article modifies is what follows the aside, not the aside's
// opening paren. (If `tokens[i+1]` were a CALL paren, `a` itself would
// already have been decided by the absolute call-form check and never reach
// scoring at all, so the callParens.has check here documents an invariant
// rather than guarding a live branch.)
function afterArticle(ctx: Context, i: number): number {
  const { tokens, callParens, matchingParen } = ctx;
  const next = i + 1;
  if (tokens[next] && tokens[next].kind === 'LPAREN' && !callParens.has(next) && matchingParen[next] >= 0) {
    return matchingParen[next] + 1;
  }
  return next;
}

// A neighbouring single letter is evidence of math - EXCEPT `a`/`A`, which are
// English words too, so they cannot vouch for anything ("a divides b" must not
// make `divides` look mathematical from the left).
const isMathyToken = (t: Token, cls: StaticClass): boolean =>
  t.kind === 'NUMBER' ||
  (t.kind === 'MATH_QUOTE') ||
  (t.kind === 'OP' && MATH_OPS.has(t.text)) ||
  (t.kind === 'WORD' && (cls === 'math' || ((isSingleLetter(t.text) || isIndexedVar(t.text)) && !AMBIGUOUS.has(t.text))));

const isProsyToken = (t: Token, cls: StaticClass): boolean => (t.kind === 'WORD' || t.kind === 'STRING') && cls === 'prose';

// ---- Step B: scoring ----
function scoreWord(ctx: Context, i: number): { score: number; reasons: string[] } {
  const { tokens, classes } = ctx;
  const w = tokens[i].text;
  const reasons: string[] = [];
  let score = 0;
  const fire = (feature: Feature, side?: 'left' | 'right') => {
    const weight = WEIGHTS[feature];
    score += weight;
    // `>= 0` (not `> 0`): a weight tuned to exactly 0 must still render with a
    // sign (`+0`) so the reason string matches the invariant checker's
    // `[+-]\d+` regex - `(0)` alone would not.
    reasons.push(`${feature}${side ? `-${side}` : ''}(${weight >= 0 ? '+' : ''}${weight})`);
  };

  const isConnective = CONNECTIVES.has(w);

  // -- shape features --
  if (isSingleLetter(w)) fire('singleLetter');
  else if (isIndexedVar(w)) fire('indexedVar');
  else if (FUNCTIONS[w] !== undefined && !VERB_FUNCTIONS.has(w)) fire('bareKeyword');
  else if (PROSE_COLLIDING_SYMBOLS.has(w)) fire('symbolWord');
  else if (!isMathTableWord(w) && !AMBIGUOUS.has(w)) fire('unknownMultiChar');

  // -- neighbourhood features --
  const sides: { dir: 1 | -1; side: 'left' | 'right' }[] = [{ dir: -1, side: 'left' }, { dir: 1, side: 'right' }];
  for (const { dir, side } of sides) {
    const j = neighborIndex(tokens, i, dir);
    if (j < 0) continue;
    if (isProsyToken(tokens[j], classes[j])) fire('neighborProse', side);
    else if (isMathyToken(tokens[j], classes[j])) fire('neighborMathy', side);
  }
  if (isConnective && tokens[i - 1] && tokens[i - 1].kind === 'OP' && tokens[i - 1].text === ',') fire('commaBefore');

  // -- sentence-level frame --
  // Connectives are settled by the sentence they live in, not by their
  // operands: `Let a and b be reals` and `p and q => r` are locally identical.
  if (isConnective) fire(ctx.hasProse ? 'proseSentence' : 'formulaSentence');

  // A quantified/implication statement between two single letters is a
  // formula. Not applied to connectives: it would override the sentence frame
  // in `Let a and b be real numbers suchthat ...`, which is English.
  if (!isConnective && ctx.hasQuantifier) {
    const leftWord = neighborWord(tokens, i, -1);
    const rightWord = neighborWord(tokens, i, 1);
    if (leftWord && rightWord && isSingleLetter(leftWord.text) && isSingleLetter(rightWord.text)) fire('quantifierContext');
  }

  // -- word-specific features --
  const prevToken = tokens[i - 1];
  const binderBefore = !!prevToken && prevToken.kind === 'WORD' && BINDERS.has(prevToken.text.toLowerCase());
  if (binderBefore && (isSingleLetter(w) || isIndexedVar(w))) fire('binderBefore');

  if (w === 'a' || w === 'A') {
    // The English article: `a` + an English word. Two things veto it:
    //  - the NEXT word is an auxiliary/copula verb ("Let a BE ...": `a` is
    //    being introduced/predicated, not modifying the word after it) - a
    //    binder immediately before `a` is NOT by itself veto-worthy, only
    //    what comes after `a` is, which is what separates "Let a be a real
    //    number" (first `a`: variable) from "Suppose a sequence converges" /
    //    "Find a real number x" (both: still the English article);
    //  - a math phrase that ENDS right after ("a divides b" is `a | b`), where
    //    "ends" means the mathy token is last or is not itself followed by
    //    English - which is what separates `a divides b` (variable) from
    //    "A function f is continuous" / "at a point c if" (article + variable).
    // "next"/"after"/"beyond" look past a non-call parenthetical aside first
    // (afterArticle): "a (possibly empty) set" reads the same as "a set", so
    // the aside must not hide the noun it modifies.
    const ni = afterArticle(ctx, i);
    const next = tokens[ni];
    const after = tokens[ni + 1];
    const beyond = tokens[ni + 2];
    const nextIsNoun = !!next && next.kind === 'WORD' && next.text.length > 1 && classes[ni] === 'prose';
    const endsInMath = !!after && isMathyToken(after, classes[ni + 1]) && !(beyond && isProsyToken(beyond, classes[ni + 2]));
    const nextIsAuxVerb = !!next && next.kind === 'WORD' && AUX_VERBS.has(next.text.toLowerCase());
    if (nextIsNoun && !endsInMath && !nextIsAuxVerb) fire('articleA');
  }

  if (w === 'in') {
    const prevIdx = neighborIndex(tokens, i, -1);
    const nextIdx = neighborIndex(tokens, i, 1);
    const prev = prevIdx >= 0 ? tokens[prevIdx] : null;
    const next = nextIdx >= 0 ? tokens[nextIdx] : null;
    const prevIsOperand = !!prev && (prev.kind === 'NUMBER' || prev.kind === 'RPAREN' ||
      (prev.kind === 'WORD' && (isSingleLetter(prev.text) || isIndexedVar(prev.text))));
    // `x in A`, `x in Math.reals`, `n in N`, and the interval/set literal forms
    // `x in (a,b)` / `x in [0,1]` / `x in {1,2}`.
    const nextIsSet = !!next && ((next.kind === 'WORD' &&
      (isUpperLetter(next.text) || GREEK[next.text] !== undefined || next.text === 'Math' || MATH_KEYWORDS.has(next.text))) ||
      next.kind === 'LPAREN' || next.kind === 'LBRACKET' || next.kind === 'LBRACE');
    if (prevIsOperand && nextIsSet) fire('inMembership');
    if (prev && isProsyToken(prev, classes[prevIdx])) fire('inProse');
  }

  return { score, reasons };
}

// ---- Step C: run assembly ----

// A `(...)` group that holds any English at all is settled HERE, as a whole,
// because the one thing it must never do is straddle a run boundary: a
// boundary between a bracket and its partner leaves that bracket alone in a
// math run, where the parser has no expression to make of it and can only
// report it as Raw (`x = 5 (by Lemma 3)` used to render its parens as two
// error spans). So the group goes one way or the other, parens included:
//
//   prose-dominant - English with no arithmetic in it: a parenthetical
//     remark ("(see above)", "(possibly empty)", "(aRb AND bRc)"). The
//     parens are punctuation of that English, so they read as prose too.
//   otherwise      - a formula that happens to contain an odd unknown word
//     ("(x + rules + 1)"): the group stays math and the word joins it,
//     rendering as an upright identifier rather than tearing the group apart.
//
// "No arithmetic" is a math OP inside the group (`=`, `+`, `^`, ...); the
// word count breaks the remaining ties toward the English reading, which is
// the one that keeps more of the source readable when it is wrong.
// Call parens are exempt: absoluteOf already made every word inside them
// math, and an argument list is never a remark. Script parens (`x_(ij)`) need
// no exemption of their own for the same reason - inScriptArgs makes every
// word inside them math too, so the prose count below is zero and the group is
// skipped on the next line.
function attachParentheticals(ctx: Context, verdicts: Verdict[], recordAt: (DecisionRecord | null)[]): void {
  const { tokens, matchingParen, callParens } = ctx;
  const setVerdict = (k: number, verdict: Verdict, reason: string): void => {
    verdicts[k] = verdict;
    const rec = recordAt[k];
    if (rec && rec.verdict !== verdict) { rec.verdict = verdict; rec.reasons.push(reason); }
  };
  for (let open = 0; open < tokens.length; open++) {
    if (tokens[open].kind !== 'LPAREN') continue;
    const close = matchingParen[open];
    if (close < 0 || callParens.has(open)) continue;
    let proseWords = 0;
    let mathWords = 0;
    let hasMathOp = false;
    for (let k = open + 1; k < close; k++) {
      const t = tokens[k];
      if (t.kind === 'WORD') verdicts[k] === 'prose' ? proseWords++ : mathWords++;
      else if (t.kind === 'OP' && MATH_OPS.has(t.text)) hasMathOp = true;
    }
    if (proseWords === 0) continue;
    if (!hasMathOp && proseWords >= mathWords) {
      for (let k = open; k <= close; k++) setVerdict(k, 'prose', 'parenthetical: joined the surrounding prose');
    } else {
      for (let k = open + 1; k < close; k++) {
        // The `parenthetical:` prefix is part of the reason grammar, not
        // decoration: every reason is either `<feature>(<weight>)` or one of
        // the `absolute:`/`parenthetical:`/`default:` prefixes, and the suite's
        // reason invariant enforces exactly that. This branch had no test
        // reaching it and so had been quietly emitting a bare string.
        if (verdicts[k] === 'prose') setVerdict(k, 'math', 'parenthetical: kept inside its math group');
      }
    }
  }
}

// The `{...}` counterpart of attachParentheticals, and it only ever resolves
// ONE way: toward math.
//
// A set-builder whose condition is written out in words - `{n : n is prime}`,
// `{x : x is positive}` - is ordinary mathematical notation, and the
// convention is to typeset the words as text INSIDE the braces. But English
// scored as prose, and a prose run in the middle of a brace group put a RUN
// BOUNDARY between `{` and its partner: the parser then had an opening brace
// with no closer and a closer with no opener, and reported both as Raw
// (`{n : n is prime}` came back as two `\texttt{}` error spans and two
// warnings). So the group goes to math whole, and parser.ts's parseCondition
// turns the words it now receives into the `\text{...}` they were always
// meant to be.
//
// Gated on the group actually BEING a set-builder (a top-level ':' or '|'
// separator, which is what the parser looks for too): `{apples, oranges}` is
// not one, and forcing a plain brace list to math would only turn its English
// into upright identifiers with nothing to gain.
function attachSetBuilders(ctx: Context, verdicts: Verdict[], recordAt: (DecisionRecord | null)[]): void {
  const { tokens, matchingParen } = ctx;
  for (let open = 0; open < tokens.length; open++) {
    if (tokens[open].kind !== 'LBRACE') continue;
    const close = matchingParen[open];
    if (close < 0) continue;
    let depth = 0;
    let hasSeparator = false;
    let proseWords = 0;
    for (let k = open + 1; k < close; k++) {
      const t = tokens[k];
      if (t.kind === 'LPAREN' || t.kind === 'LBRACKET' || t.kind === 'LBRACE') depth++;
      else if (t.kind === 'RPAREN' || t.kind === 'RBRACKET' || t.kind === 'RBRACE') depth = Math.max(0, depth - 1);
      else if (depth === 0 && t.kind === 'OP' && (t.text === ':' || t.text === '|')) hasSeparator = true;
      else if (t.kind === 'WORD' && verdicts[k] === 'prose') proseWords++;
    }
    if (!hasSeparator || proseWords === 0) continue;
    for (let k = open + 1; k < close; k++) {
      if (verdicts[k] === 'math') continue;
      verdicts[k] = 'math';
      const rec = recordAt[k];
      if (rec) { rec.verdict = 'math'; rec.reasons.push('set-builder: kept inside its set'); }
    }
  }
}

// `,` `.` `;` `:` and stray PUNCT belong to the text they separate: prose when
// every neighbour that exists reads as prose, math otherwise (so `[0,1]` and
// `f(1, 2)` keep their commas, and a sentence keeps its full stop).
// A STRING moves the other way: it is prose by default, but between two math
// tokens (`x = "by parts" + 1`) it stays inside the math run as a Text atom -
// a TRAILING string (nothing after it, e.g. `x = "by parts"` alone) has no
// right neighbour to satisfy that test, so it stays its own prose run instead
// (see the 'Quotes' tests in test-disambiguate.mjs).
function attachPunctuation(ctx: Context, verdicts: Verdict[]): void {
  const { tokens } = ctx;
  const sideVerdict = (i: number, dir: 1 | -1): Verdict | null => {
    for (let j = i + dir; j >= 0 && j < tokens.length; j += dir) {
      if (isAttaching(tokens[j])) continue;
      return verdicts[j];
    }
    return null;
  };
  const next = verdicts.slice();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!isAttaching(t) && t.kind !== 'STRING') continue;
    const left = sideVerdict(i, -1);
    const right = sideVerdict(i, 1);
    // The SENTENCE colon is the one attaching character whose left side alone
    // settles it: "Note the following: x = 1" introduces the mathematics with
    // a piece of English punctuation, so the colon belongs to the words even
    // though what follows it is a formula. Left as math, it opened a math run
    // of its own that began with a bare ':' - which the parser can only
    // recover as Raw (`\texttt{:}`). A colon with math on its LEFT is
    // untouched: that is the set-builder separator (`{n : n is prime}`) or a
    // ratio, and both are notation.
    if (t.kind === 'OP' && t.text === ':' && left === 'prose') next[i] = 'prose';
    else if (isAttaching(t)) next[i] = (left !== null || right !== null) && left !== 'math' && right !== 'math' ? 'prose' : 'math';
    else if (left === 'math' && right === 'math') next[i] = 'math';
  }
  for (let i = 0; i < tokens.length; i++) verdicts[i] = next[i];
}

function assembleRuns(tokens: Token[], verdicts: Verdict[]): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.kind === verdicts[i]) last.tokens.push(tokens[i]);
    else runs.push({ kind: verdicts[i], tokens: [tokens[i]] });
  }
  return runs;
}

// ---- Entry point ----
export function segment(tokens: Token[], diagnostics: Diagnostic[]): { runs: Run[]; explain: DecisionRecord[] } {
  if (tokens.length === 0) return { runs: [], explain: [] };

  const ctx = buildContext(tokens);
  const explain: DecisionRecord[] = [];
  const verdicts = new Array<Verdict>(tokens.length);
  const recordAt = new Array<DecisionRecord | null>(tokens.length).fill(null);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'WORD') {
      // STRING is verbatim text; MATH_QUOTE, numbers, operators, brackets and
      // stray punctuation are math (the attachment passes below refine the
      // punctuation that sits between prose).
      verdicts[i] = t.kind === 'STRING' ? 'prose' : 'math';
      continue;
    }
    const abs = absoluteOf(tokens, i, ctx);
    let record: DecisionRecord;
    if (abs) {
      record = { word: t.text, span: t.span, verdict: abs.verdict, score: abs.verdict === 'math' ? ABSOLUTE_SCORE : -ABSOLUTE_SCORE, reasons: [abs.reason] };
    } else {
      const { score, reasons } = scoreWord(ctx, i);
      const verdict: Verdict = score > 0 ? 'math' : 'prose';
      record = { word: t.text, span: t.span, verdict, score, reasons: reasons.length > 0 ? reasons : ['default: no feature fired'] };
      // A dead tie is the one place the reader deserves a nudge: the word could
      // honestly go either way, and MathScript has explicit escapes for both.
      if (score === 0) {
        diagnostics.push({
          span: t.span,
          severity: 'info',
          message: `'${t.text}' is ambiguous here — reading it as text`,
          hint: `write $${t.text}$ (or ${t.text}(...)) to force math, or "${t.text}" to force text`,
        });
      }
    }
    verdicts[i] = record.verdict;
    recordAt[i] = record;
    explain.push(record);
  }

  attachParentheticals(ctx, verdicts, recordAt);
  attachSetBuilders(ctx, verdicts, recordAt);
  attachPunctuation(ctx, verdicts);
  return { runs: assembleRuns(tokens, verdicts), explain };
}
