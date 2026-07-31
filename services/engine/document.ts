// MathBrain Engine v2 - Document parser (Stage 2 of the pipeline: lexer ->
// DOCUMENT -> disambiguator -> expression parser -> renderer).
//
// Turns the flat token stream from lex() into the tree of Block nodes
// (Scope/Subtask/Claim/Statement/Blank) that drives numbering/indentation in
// the renderer (Task 6) and caret lookup (Task 7). This stage does NOT parse
// expressions - Statement and Claim blocks just carry their raw statement
// tokens (via the StatementTokens extension below) for later pipeline stages
// to turn into Segment[]/Expr trees. `segments`/`statement` stay empty here.
//
// Processing is strictly line-oriented: NEWLINE tokens delimit lines, and
// each line is classified by its token shape (scope-open / subtask-open /
// claim-open / close / define / plain statement) before any expression-level
// meaning is assigned.

import type { Token, Diagnostic, DocumentAst, Block, Span } from './types';
import { SCOPES } from './language';
import { lex } from './lexer';

// Extension carried by Statement & Claim blocks: their raw statement tokens,
// for later pipeline stages to read via `(block as Block & StatementTokens).tokens`.
export interface StatementTokens { tokens: Token[] }

// ---- Line splitting ----
// A DocLine's `tokens` are the RAW tokens between two NEWLINEs (COMMENT
// tokens still present - callers strip them where content is being
// classified, but block *spans* are measured against the raw line so a
// trailing comment still contributes to span fidelity).
interface DocLine { lineNo: number; tokens: Token[] }

function splitLines(tokens: Token[]): DocLine[] {
  const lines: DocLine[] = [];
  let current: Token[] = [];
  let lineNo = 1;
  for (const t of tokens) {
    if (t.kind === 'NEWLINE') {
      lines.push({ lineNo: t.span.startLine, tokens: current });
      lineNo = t.span.startLine + 1;
      current = [];
    } else {
      current.push(t);
    }
  }
  // Trailing line with no terminating NEWLINE (normal EOF case). If the
  // source ended right on a NEWLINE, `current` is empty here and there is no
  // phantom extra line to add.
  if (current.length > 0) {
    lines.push({ lineNo, tokens: current });
  }
  return lines;
}

const stripComments = (tokens: Token[]): Token[] => tokens.filter((t) => t.kind !== 'COMMENT');

// ---- Span helpers (rule 11: every Block gets a span covering the whole
// block including children; cols come from the first/last token of the
// first/last physical line the block spans). ----
function lineSpanBounds(line: DocLine): Span {
  if (line.tokens.length === 0) {
    return { startLine: line.lineNo, startCol: 0, endLine: line.lineNo, endCol: 0 };
  }
  const first = line.tokens[0];
  const last = line.tokens[line.tokens.length - 1];
  return { startLine: first.span.startLine, startCol: first.span.startCol, endLine: last.span.endLine, endCol: last.span.endCol };
}
const combineSpans = (start: Span, end: Span): Span => ({ startLine: start.startLine, startCol: start.startCol, endLine: end.endLine, endCol: end.endCol });

// ---- Title / replacement-text joining (rules 2 & 4): single-space join,
// then collapse whitespace around '.' so `Math . naturals` -> `Math.naturals`. ----
function joinTokenTexts(tokens: Token[]): string {
  return tokens.map((t) => t.text).join(' ').replace(/\s*\.\s*/g, '.');
}

// ---- Macro expansion (rule 3) ----
// Replaces every WORD token whose text is a known macro name with the tokens
// of its (already-lexed-at-definition-time) replacement, re-spanning each
// spliced token to the ORIGINAL word's span so spans always point into the
// real source.
function expandMacros(tokens: Token[], macroTokens: Map<string, Token[]>): Token[] {
  const out: Token[] = [];
  for (const t of tokens) {
    const replacement = t.kind === 'WORD' ? macroTokens.get(t.text) : undefined;
    if (replacement) {
      for (const rt of replacement) out.push({ ...rt, span: t.span });
    } else {
      out.push(t);
    }
  }
  return out;
}

// ---- #define detection (rule 2) ----
// `#define` has no separator, so it lexes as PUNCT:'#' immediately (adjacent
// spans - no space) followed by WORD:'define'; verified against the real
// lexer output before relying on it here.
function isDefineLine(content: Token[]): boolean {
  if (content.length < 2) return false;
  const hash = content[0];
  const defineWord = content[1];
  return (
    hash.kind === 'PUNCT' && hash.text === '#' &&
    defineWord.kind === 'WORD' && defineWord.text === 'define' &&
    hash.span.endLine === defineWord.span.startLine && hash.span.endCol === defineWord.span.startCol
  );
}

// ---- Scope open (rule 4) ----
// NOTE: 'cases' must NEVER match a scope (it's the piecewise environment),
// even though full-word case-insensitive equality against SCOPES keys
// wouldn't accidentally hit it today ('cases' !== 'case') - guarded
// explicitly per the task spec for clarity and future-proofing.
interface ScopeOpenMatch { nameTok: Token; canonicalName: string; styling: 'bold' | 'italic'; titleTokens: Token[] }
function matchScopeOpen(content: Token[]): ScopeOpenMatch | null {
  if (content.length < 2) return null;
  const first = content[0];
  const last = content[content.length - 1];
  if (first.kind !== 'WORD' || last.kind !== 'LBRACE') return null;
  if (first.text.toLowerCase() === 'cases') return null;
  const canonicalName = Object.keys(SCOPES).find((k) => k.toLowerCase() === first.text.toLowerCase());
  if (!canonicalName) return null;
  return { nameTok: first, canonicalName, styling: SCOPES[canonicalName], titleTokens: content.slice(1, content.length - 1) };
}

// ---- Subtask open (rule 5) ----
// The lexer emits `--` as TWO OP:'-' tokens, so depth = count of consecutive
// leading OP:'-' tokens. >4 dashes, or dashes not ending in LBRACE, means
// "just a statement" (both handled by returning null here).
interface SubtaskOpenMatch { depth: number; titleTokens: Token[] }
function matchSubtaskOpen(content: Token[]): SubtaskOpenMatch | null {
  let depth = 0;
  while (depth < content.length && content[depth].kind === 'OP' && content[depth].text === '-') depth++;
  if (depth < 1 || depth > 4) return null;
  if (content.length <= depth) return null;
  const last = content[content.length - 1];
  if (last.kind !== 'LBRACE') return null;
  return { depth, titleTokens: content.slice(depth, content.length - 1) };
}

// ---- Claim open (rule 6): PUNCT:'?' OP:':' ... LBRACE ----
interface ClaimOpenMatch { statementTokens: Token[] }
function matchClaimOpen(content: Token[]): ClaimOpenMatch | null {
  if (content.length < 3) return null;
  if (content[0].kind !== 'PUNCT' || content[0].text !== '?') return null;
  if (content[1].kind !== 'OP' || content[1].text !== ':') return null;
  const last = content[content.length - 1];
  if (last.kind !== 'LBRACE') return null;
  return { statementTokens: content.slice(2, content.length - 1) };
}

// ---- Close line (rule 7): a line that is EXACTLY RBRACE ----
const isCloseLine = (content: Token[]): boolean => content.length === 1 && content[0].kind === 'RBRACE';

// ---- Rule 9: multi-line merge for cases{}/matrix(...) bodies ----
// A single pooled bracket-depth stack over LBRACE/LPAREN/LBRACKET. A frame is
// "triggered" when its opening bracket immediately follows WORD:'cases'
// (LBRACE) or WORD:'matrix'/'bmatrix'/'vmatrix' (LPAREN); merge logic only
// engages when the OUTERMOST currently-unmatched frame is a trigger, per the
// "AND the imbalance began inside a construct opened by..." clause - a
// generic unbalanced paren typo must not swallow the rest of the file.
type MergeTrigger = 'cases' | 'matrix' | null;
interface BracketFrame { kind: 'LBRACE' | 'LPAREN' | 'LBRACKET'; trigger: MergeTrigger }
const MATRIX_WORDS = new Set(['matrix', 'bmatrix', 'vmatrix']);

function scanBracketStack(tokens: Token[], stack: BracketFrame[]): BracketFrame[] {
  const result = stack.slice();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'LBRACE' || t.kind === 'LPAREN' || t.kind === 'LBRACKET') {
      const prev = tokens[i - 1];
      let trigger: MergeTrigger = null;
      if (t.kind === 'LBRACE' && prev && prev.kind === 'WORD' && prev.text === 'cases') trigger = 'cases';
      if (t.kind === 'LPAREN' && prev && prev.kind === 'WORD' && MATRIX_WORDS.has(prev.text)) trigger = 'matrix';
      result.push({ kind: t.kind, trigger });
    } else if (t.kind === 'RBRACE' || t.kind === 'RPAREN' || t.kind === 'RBRACKET') {
      if (result.length > 0) result.pop();
    }
  }
  return result;
}

interface MergeResult { tokens: Token[]; nextIdx: number; unclosed: boolean }

// Absorbs lines[startIdx+1..] into `firstContent` until the bracket stack
// (seeded from firstContent's own imbalance) returns to empty, inserting a
// synthetic OP:';' between adjacent absorbed lines when trigger==='cases' -
// but never right after the opening LBRACE nor right before the closing
// RBRACE (those boundaries are "opening"/"closing" lines, not body-to-body
// boundaries). Runs to EOF (unclosed:true) if balance never returns to 0.
function mergeStatementLines(
  lines: DocLine[],
  startIdx: number,
  firstContent: Token[],
  trigger: 'cases' | 'matrix',
  initialStack: BracketFrame[],
): MergeResult {
  const merged: Token[] = firstContent.slice();
  let stack = initialStack;
  let idx = startIdx + 1;
  while (stack.length > 0) {
    if (idx >= lines.length) {
      return { tokens: merged, nextIdx: idx, unclosed: true };
    }
    const lineContent = stripComments(lines[idx].tokens);
    if (trigger === 'cases' && merged.length > 0 && lineContent.length > 0) {
      const prevLast = merged[merged.length - 1];
      const nextFirst = lineContent[0];
      if (prevLast.text !== ';' && prevLast.kind !== 'LBRACE' && nextFirst.kind !== 'RBRACE') {
        merged.push({ kind: 'OP', text: ';', span: { startLine: prevLast.span.endLine, startCol: prevLast.span.endCol, endLine: prevLast.span.endLine, endCol: prevLast.span.endCol } });
      }
    }
    merged.push(...lineContent);
    stack = scanBracketStack(lineContent, stack);
    idx += 1;
  }
  return { tokens: merged, nextIdx: idx, unclosed: false };
}

// ---- Recursive block parsing ----

interface ChildrenResult { children: Block[]; nextIdx: number; closed: boolean }

// Parses blocks starting at `startIdx` until either a bare `}` line closes
// this level (closed:true) or EOF is reached (closed:false). At the
// top level there is no enclosing construct, so a bare `}` there is
// unmatched (rule 7) rather than a close.
function parseChildren(
  lines: DocLine[],
  startIdx: number,
  macros: Record<string, string>,
  macroTokens: Map<string, Token[]>,
  diagnostics: Diagnostic[],
  topLevel: boolean,
): ChildrenResult {
  const children: Block[] = [];
  let idx = startIdx;
  while (idx < lines.length) {
    const line = lines[idx];
    const content = stripComments(line.tokens);
    if (isCloseLine(content)) {
      if (topLevel) {
        diagnostics.push({ span: lineSpanBounds(line), severity: 'warn', message: 'unmatched } — ignored' });
        children.push({ kind: 'Blank', span: lineSpanBounds(line) });
        idx += 1;
        continue;
      }
      return { children, nextIdx: idx + 1, closed: true };
    }
    const { block, nextIdx } = parseBlockAt(lines, idx, macros, macroTokens, diagnostics);
    children.push(block);
    idx = nextIdx;
  }
  return { children, nextIdx: idx, closed: false };
}

function parseBlockAt(
  lines: DocLine[],
  idx: number,
  macros: Record<string, string>,
  macroTokens: Map<string, Token[]>,
  diagnostics: Diagnostic[],
): { block: Block; nextIdx: number } {
  const line = lines[idx];
  const content = stripComments(line.tokens);

  // Rule 1: empty or COMMENT-only line -> Blank (span from the raw line so a
  // lone comment still gets a real span).
  if (content.length === 0) {
    return { block: { kind: 'Blank', span: lineSpanBounds(line) }, nextIdx: idx + 1 };
  }

  // Rule 2: #define name replacement... -> record macro, produce Blank.
  if (isDefineLine(content)) {
    const nameTok = content[2];
    if (nameTok && nameTok.kind === 'WORD') {
      const replacementTokens = content.slice(3);
      const replacementText = joinTokenTexts(replacementTokens);
      macros[nameTok.text] = replacementText;
      const lexedReplacement = lex(replacementText).tokens.filter((t) => t.kind !== 'NEWLINE');
      macroTokens.set(nameTok.text, lexedReplacement);
    }
    return { block: { kind: 'Blank', span: lineSpanBounds(line) }, nextIdx: idx + 1 };
  }

  // Rule 4: Scope open.
  const scopeMatch = matchScopeOpen(content);
  if (scopeMatch) {
    const title = joinTokenTexts(expandMacros(scopeMatch.titleTokens, macroTokens));
    const { children, nextIdx, closed } = parseChildren(lines, idx + 1, macros, macroTokens, diagnostics, false);
    const endLine = lines[Math.min(nextIdx, lines.length) - 1] ?? line;
    const span = combineSpans(lineSpanBounds(line), lineSpanBounds(endLine));
    if (!closed) {
      diagnostics.push({ span: scopeMatch.nameTok.span, severity: 'info', message: `unclosed scope: ${scopeMatch.canonicalName}` });
    }
    const block: Block = { kind: 'Scope', scopeType: scopeMatch.canonicalName, title, styling: scopeMatch.styling, children, span };
    return { block, nextIdx };
  }

  // Rule 5: Subtask open.
  const subtaskMatch = matchSubtaskOpen(content);
  if (subtaskMatch) {
    const title = joinTokenTexts(subtaskMatch.titleTokens);
    const { children, nextIdx } = parseChildren(lines, idx + 1, macros, macroTokens, diagnostics, false);
    const endLine = lines[Math.min(nextIdx, lines.length) - 1] ?? line;
    const span = combineSpans(lineSpanBounds(line), lineSpanBounds(endLine));
    // Rule 10 only specifies a diagnostic for unclosed *scopes*; an unclosed
    // Subtask is returned (per rule 10's "blocks still returned") without one.
    const block: Block = { kind: 'Subtask', depth: subtaskMatch.depth, title, children, span };
    return { block, nextIdx };
  }

  // Rule 6: Claim open.
  const claimMatch = matchClaimOpen(content);
  if (claimMatch) {
    const tokens = expandMacros(claimMatch.statementTokens, macroTokens);
    const { children, nextIdx } = parseChildren(lines, idx + 1, macros, macroTokens, diagnostics, false);
    const endLine = lines[Math.min(nextIdx, lines.length) - 1] ?? line;
    const span = combineSpans(lineSpanBounds(line), lineSpanBounds(endLine));
    const block: Block & StatementTokens = { kind: 'Claim', statement: [], children, span, tokens };
    return { block, nextIdx };
  }

  // Rule 8/9: plain statement, possibly absorbing following lines (rule 9).
  const initialStack = scanBracketStack(content, []);
  if (initialStack.length > 0 && initialStack[0].trigger) {
    const trigger = initialStack[0].trigger;
    const merge = mergeStatementLines(lines, idx, content, trigger, initialStack);
    if (merge.unclosed) {
      diagnostics.push({ span: lineSpanBounds(line), severity: 'warn', message: 'unclosed cases/matrix — merged to end of file' });
    }
    const endLine = lines[Math.min(merge.nextIdx, lines.length) - 1] ?? line;
    const span = combineSpans(lineSpanBounds(line), lineSpanBounds(endLine));
    const tokens = expandMacros(merge.tokens, macroTokens);
    const block: Block & StatementTokens = { kind: 'Statement', segments: [], span, tokens };
    return { block, nextIdx: merge.nextIdx };
  }

  const tokens = expandMacros(content, macroTokens);
  const block: Block & StatementTokens = { kind: 'Statement', segments: [], span: lineSpanBounds(line), tokens };
  return { block, nextIdx: idx + 1 };
}

// ---- Entry point ----
export function parseDocument(tokens: Token[], diagnostics: Diagnostic[]): DocumentAst {
  const lines = splitLines(tokens);
  const macros: Record<string, string> = {};
  const macroTokens = new Map<string, Token[]>();
  const { children } = parseChildren(lines, 0, macros, macroTokens, diagnostics, true);
  return { blocks: children, macros };
}
