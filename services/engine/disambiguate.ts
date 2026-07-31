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
// Positive pulls toward math, negative toward prose. Retuning the classifier
// means editing these numbers and nothing else.
export const WEIGHTS: { [feature: string]: number } = {
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
};

// Absolutes do not score; they get a finite sentinel so DecisionRecord.score
// stays a plain sortable number (±Infinity prints badly in the explain table).
const ABSOLUTE_SCORE = 100;

// ---- Word sets that only the disambiguator needs ----

// Words that appear in a math table but are ALSO ordinary English, so they can
// never be decided by vocabulary alone.
const AMBIGUOUS = new Set(['and', 'or', 'not', 'in', 'a', 'A']);

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

// OP texts that read as mathematics when they sit next to an ambiguous word.
const MATH_OPS = new Set(['=', '+', '-', '*', '/', '^', '_', '<', '>', '<=', '>=', '!=', '->', '=>', '<=>', '+-', '-+', '|', "'"]);

// Sentence-level evidence for quantifierContext.
const QUANTIFIER_WORDS = new Set(['forall', 'exists', 'suchthat', 'notin', 'implies', 'iff']);
const QUANTIFIER_OPS = new Set(['=>', '<=>']);

// Punctuation that belongs to whichever side it separates rather than to a
// run of its own (see attachPunctuation).
const ATTACHING_OPS = new Set([',', '.', ';', ':']);

const isSingleLetter = (w: string): boolean => w.length === 1 && /[A-Za-z]/.test(w);
const isIndexedVar = (w: string): boolean => /^[A-Za-z][0-9]+$/.test(w);
const isUpperLetter = (w: string): boolean => w.length === 1 && w >= 'A' && w <= 'Z';
const isMathTableWord = (w: string): boolean => GREEK[w] !== undefined || MATH_KEYWORDS.has(w) || SYMBOL_MAP[w] !== undefined;
const isAttaching = (t: Token): boolean => t.kind === 'PUNCT' || (t.kind === 'OP' && ATTACHING_OPS.has(t.text));

// ---- Per-statement context, computed once ----
interface Context {
  tokens: Token[];
  classes: StaticClass[];    // static class of every token
  inCallArgs: boolean[];     // token sits inside the parens of a function call
  matchingParen: number[];   // LPAREN index -> its RPAREN index (and back), else -1
  hasProse: boolean;         // statement contains at least one English-reading word
  hasQuantifier: boolean;    // statement contains forall/exists/suchthat/notin/=>/<=>
}

// A call is `WORD ['...] (` where WORD is a known function or a single letter:
// `sum(`, `f(`, `F'(`. A multi-char unknown word plus `(` is NOT a call - an
// English sentence may simply end in a parenthetical. `cases {` counts too:
// its body is a math environment, keywords and all (`v if c; v2 otherwise`).
function callOpenerOf(tokens: Token[], wordIndex: number): number {
  const w = tokens[wordIndex];
  if (!w || w.kind !== 'WORD') return -1;
  const isFunction = FUNCTIONS[w.text] !== undefined;
  if (!isFunction && !isSingleLetter(w.text)) return -1;
  let k = wordIndex + 1;
  while (tokens[k] && tokens[k].kind === 'OP' && tokens[k].text === "'") k++;
  const opener = tokens[k];
  if (!opener) return -1;
  if (opener.kind === 'LPAREN' || (opener.kind === 'LBRACE' && isFunction)) return k;
  return -1;
}

// `Math.reals` lexes as WORD OP('.') WORD; the member must not be torn out of
// the formula just because "reals" is in no table.
// Unknown members (`Math.foo`) count too: splitting the run would be worse
// than rendering an unknown identifier.
const isMathPackageMember = (tokens: Token[], i: number): boolean =>
  !!tokens[i - 2] && tokens[i - 2].kind === 'WORD' && tokens[i - 2].text === 'Math' &&
  !!tokens[i - 1] && tokens[i - 1].kind === 'OP' && tokens[i - 1].text === '.';

// A word directly after `_` or `^` is a script operand (`x_max`), never prose.
const isScriptOperand = (tokens: Token[], i: number): boolean =>
  !!tokens[i - 1] && tokens[i - 1].kind === 'OP' && (tokens[i - 1].text === '_' || tokens[i - 1].text === '^');

// Step A. Returns null when the word must be scored.
function absoluteOf(tokens: Token[], i: number, inCallArgs: boolean[]): { verdict: Verdict; reason: string } | null {
  const w = tokens[i].text;

  // Context absolutes first: they outrank vocabulary (`a(x)` is a call even
  // though `a` is normally the English article).
  if (callOpenerOf(tokens, i) >= 0) return { verdict: 'math', reason: 'absolute: call form' };
  if (inCallArgs[i]) return { verdict: 'math', reason: 'absolute: function argument' };
  if (isMathPackageMember(tokens, i)) return { verdict: 'math', reason: 'absolute: Math.* member' };
  if (isScriptOperand(tokens, i)) return { verdict: 'math', reason: 'absolute: script operand' };

  // Vocabulary absolutes.
  if (AMBIGUOUS.has(w)) return null;
  // BARE-CALLABLE carve-out: `sum`/`lim`/`sin` without parens are English as
  // often as they are math ("we use the sum and product rules"), so they are
  // scored (bareKeyword) instead of being math by keyword membership.
  if (FUNCTIONS[w] !== undefined) return null;
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
function staticClassOf(tokens: Token[], i: number, inCallArgs: boolean[]): StaticClass {
  const t = tokens[i];
  if (t.kind === 'STRING') return 'prose';
  if (t.kind !== 'WORD') return 'math';
  const abs = absoluteOf(tokens, i, inCallArgs);
  if (abs) return abs.verdict;
  const w = t.text;
  if (AMBIGUOUS.has(w) || isSingleLetter(w) || isIndexedVar(w) || FUNCTIONS[w] !== undefined) return 'ambiguous';
  return 'prose';
}

function buildContext(tokens: Token[]): Context {
  const n = tokens.length;
  const inCallArgs = new Array<boolean>(n).fill(false);
  const matchingParen = new Array<number>(n).fill(-1);
  const stack: { index: number; kind: 'LPAREN' | 'LBRACE'; isCall: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    if (t.kind === 'LPAREN' || t.kind === 'LBRACE') {
      const opensCall = i > 0 && callOpenerOf(tokens, i - 1) === i;
      // Nested groups inherit: `sin(2*(x+1))` is all argument.
      stack.push({ index: i, kind: t.kind, isCall: opensCall || (stack.length > 0 && stack[stack.length - 1].isCall) });
    } else if (t.kind === 'RPAREN' || t.kind === 'RBRACE') {
      // A closer that does not match the open frame is left unpaired rather
      // than popping someone else's frame (recovery on malformed input).
      const open = stack[stack.length - 1];
      if (open && ((open.kind === 'LPAREN' && t.kind === 'RPAREN') || (open.kind === 'LBRACE' && t.kind === 'RBRACE'))) {
        stack.pop();
        if (t.kind === 'RPAREN') { matchingParen[open.index] = i; matchingParen[i] = open.index; }
      }
    } else if (stack.length > 0 && stack[stack.length - 1].isCall) {
      inCallArgs[i] = true;
    }
  }

  const classes = tokens.map((_, i) => staticClassOf(tokens, i, inCallArgs));
  const hasProse = tokens.some((t, i) => t.kind === 'WORD' && classes[i] === 'prose');
  const hasQuantifier = tokens.some((t) =>
    (t.kind === 'WORD' && QUANTIFIER_WORDS.has(t.text)) || (t.kind === 'OP' && QUANTIFIER_OPS.has(t.text)));
  return { tokens, classes, inCallArgs, matchingParen, hasProse, hasQuantifier };
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
  const fire = (feature: string, side?: 'left' | 'right') => {
    const weight = WEIGHTS[feature];
    score += weight;
    reasons.push(`${feature}${side ? `-${side}` : ''}(${weight > 0 ? '+' : ''}${weight})`);
  };

  const isConnective = CONNECTIVES.has(w);

  // -- shape features --
  if (isSingleLetter(w)) fire('singleLetter');
  else if (isIndexedVar(w)) fire('indexedVar');
  else if (FUNCTIONS[w] !== undefined) fire('bareKeyword');
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

  const leftWord = neighborWord(tokens, i, -1);
  const rightWord = neighborWord(tokens, i, 1);

  // A quantified/implication statement between two single letters is a
  // formula. Not applied to connectives: it would override the sentence frame
  // in `Let a and b be real numbers suchthat ...`, which is English.
  if (!isConnective && ctx.hasQuantifier && leftWord && rightWord && isSingleLetter(leftWord.text) && isSingleLetter(rightWord.text)) {
    fire('quantifierContext');
  }

  // -- word-specific features --
  const prevToken = tokens[i - 1];
  const binderBefore = !!prevToken && prevToken.kind === 'WORD' && BINDERS.has(prevToken.text.toLowerCase());
  if (binderBefore && (isSingleLetter(w) || isIndexedVar(w))) fire('binderBefore');

  if (w === 'a' || w === 'A') {
    // The English article: `a` + an English word. Two things veto it:
    //  - a binder ("Let a be ...": `a` is being introduced, not modifying a noun);
    //  - a math phrase that ENDS right after ("a divides b" is `a | b`), where
    //    "ends" means the mathy token is last or is not itself followed by
    //    English - which is what separates `a divides b` (variable) from
    //    "A function f is continuous" / "at a point c if" (article + variable).
    const next = tokens[i + 1];
    const after = tokens[i + 2];
    const beyond = tokens[i + 3];
    const nextIsNoun = !!next && next.kind === 'WORD' && next.text.length > 1 && classes[i + 1] === 'prose';
    const endsInMath = !!after && isMathyToken(after, classes[i + 2]) && !(beyond && isProsyToken(beyond, classes[i + 3]));
    if (nextIsNoun && !endsInMath && !binderBefore) fire('articleA');
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

// A parenthetical remark - prose ( ... prose ... ) prose - is English all the
// way through, parens included. Everything else keeps its own class, so call
// parens and grouping parens stay math. A missing neighbour at either edge of
// the statement counts as satisfied, so a trailing "(see above)" still works.
function attachParentheticals(ctx: Context, verdicts: Verdict[], recordAt: (DecisionRecord | null)[]): void {
  const { tokens, matchingParen } = ctx;
  for (let open = 0; open < tokens.length; open++) {
    if (tokens[open].kind !== 'LPAREN') continue;
    const close = matchingParen[open];
    if (close < 0) continue;
    const before = open > 0 ? verdicts[open - 1] : null;
    const after = close < tokens.length - 1 ? verdicts[close + 1] : null;
    if (before === 'math' || after === 'math') continue;
    if (before === null && after === null) continue; // whole statement is one group: leave it alone
    let hasProseWord = false;
    for (let k = open + 1; k < close; k++) if (tokens[k].kind === 'WORD' && verdicts[k] === 'prose') hasProseWord = true;
    if (!hasProseWord) continue;
    for (let k = open; k <= close; k++) {
      verdicts[k] = 'prose';
      const rec = recordAt[k];
      if (rec && rec.verdict !== 'prose') { rec.verdict = 'prose'; rec.reasons.push('parenthetical: joined the surrounding prose'); }
    }
  }
}

// `,` `.` `;` `:` and stray PUNCT belong to the text they separate: prose when
// every neighbour that exists reads as prose, math otherwise (so `[0,1]` and
// `f(1, 2)` keep their commas, and a sentence keeps its full stop).
// A STRING moves the other way: it is prose by default, but between two math
// tokens (`x = "by parts"`) it stays inside the math run as a Text atom.
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
    if (isAttaching(t)) next[i] = (left !== null || right !== null) && left !== 'math' && right !== 'math' ? 'prose' : 'math';
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
    const abs = absoluteOf(tokens, i, ctx.inCallArgs);
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
  attachPunctuation(ctx, verdicts);
  return { runs: assembleRuns(tokens, verdicts), explain };
}
