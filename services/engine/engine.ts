// MathBrain Engine v2 - Public API. Everything outside services/engine/ talks
// to the engine through this file and nothing else:
//
//   compile(source)                        -> LaTeX lines + macros + diagnostics
//                                             + AST + statement index
//   nodeAt(result, line, col)              -> the structural node under a caret
//   renderLineWithHighlight(result, l, c)  -> that node's line, re-rendered tinted
//
// ---- One parse, one diagnostics array ----
//
// compile() runs the pipeline exactly once per statement. It walks the block
// tree ITSELF (in document order), calls parseStatement on every Statement/
// Claim block, keeps the resulting ParsedSegment[] in two places - the public
// `index` (so nodeAt can search the Expr trees later) and a Block ->
// ParsedSegment[] map - and then hands that map to renderDocument, which uses
// it instead of parsing again. Skipping that hand-off would not just waste
// the work: parseStatement emits the segmenter's and parser's diagnostics, so
// a second parse would report every "could not parse" TWICE.
//
// There is likewise exactly ONE Diagnostic[] for the whole compile: the
// lexer's diagnostics seed it, and the document parser, the statement parses
// and the renderer all append to that same array, in source order.
//
// ---- The caret model ----
//
// Spans are 1-based lines / 0-based columns, end-exclusive (types.ts), and
// are measured against the lexer's NORMALIZED text. A caret coming from the
// editor, though, is in RAW source coordinates - the text the user actually
// typed, before `·≤≥≠→` and friends are rewritten (lexer.ts's rule 1) - so
// the public nodeAt() maps every incoming column through normalizedCol()
// (against the matching raw line, kept on the compile() result as
// `sourceLines`) before it ever compares a column to a span. Past that point
// - pathToCaret, nodeAtNormalized, spanContains - everything works in
// normalized coordinates only; raw columns exist nowhere below nodeAt()'s
// own top.
//
// nodeAt also applies a "character-behind" convention: a strict miss (most
// commonly a caret sitting one column past the last character of a
// statement - exactly where it lands the instant the user finishes typing,
// and end-exclusive spans mean that column belongs to nothing) retries once
// at `col - 1` before giving up, so the node the user just finished typing
// is still found.
//
// nodeAtNormalized walks DOWN to the smallest node containing the caret and
// then back UP to the nearest STRUCTURAL ancestor. The walk up is the whole
// point: the smallest node under the caret is almost always a bare leaf (the
// `1` in `(x-1)`), and tinting - or, later, transforming - a lone digit is
// not a useful unit of work. The nearest enclosing Frac/Pow/Call/... is.

import type { Block, CompileResult, Diagnostic, Expr, Span, Token } from './types';
import type { StatementTokens } from './document';
import type { ParsedSegment } from './render';
import { lex, normalizedCol } from './lexer';
import { parseDocument } from './document';
import { childrenOf, parseStatement, renderDocument, renderStatementLine } from './render';

// ---- Public types ----

/** One statement of the document, with its parsed segments retained. The
 *  compile-time record nodeAt() searches, and renderLineWithHighlight()
 *  re-renders from. */
export interface StatementIndexEntry {
  blockKind: 'Statement' | 'Claim';
  /** First source line of the block - the same line the rendered EngineLine
   *  reports as its `originalLine`. */
  line: number;
  /** Nesting depth in the block tree, i.e. the statement's \quad count. */
  indent: number;
  segments: ParsedSegment[];
  /** The statement's OWN tokens (see statementSpan) - not the block's span. */
  span: Span;
}

/** A caret resolved to a node, plus the statement it lives in. */
export interface NodeHit { expr: Expr; statement: StatementIndexEntry }

export type EngineResult = CompileResult & {
  index: StatementIndexEntry[];
  /** The raw source, split on '\n' - one entry per 1-based line number minus
   *  one. Used only to map an incoming caret's RAW column onto the lexer's
   *  NORMALIZED coordinates before span lookup (see "The caret model" above);
   *  nothing else in the engine reads it. */
  sourceLines: string[];
};

// Node kinds worth selecting: the ones that mean something structurally, and
// that a user would recognise as "the thing I clicked". Everything else
// (leaves, BinOp/UnaryOp chains, Group parens, Prime, set/vector literals)
// hands the caret to its parent instead.
const STRUCTURAL_KINDS = new Set<Expr['kind']>([
  'Frac', 'Pow', 'Sub', 'Call', 'BigOp', 'SetBuilder', 'Abs', 'Matrix', 'Cases', 'Relation',
]);

// ---- Span geometry ----

/** Caret-in-span test: end-exclusive on the column, so a caret sitting just
 *  past a node's last character belongs to whatever comes next, not to that
 *  node. Interior lines of a multi-line span match at any column. */
function spanContains(span: Span, line: number, col: number): boolean {
  if (line < span.startLine || line > span.endLine) return false;
  if (line === span.startLine && col < span.startCol) return false;
  if (line === span.endLine && col >= span.endCol) return false;
  return true;
}

/** The span a caret is matched against for a Statement/Claim block: the
 *  extent of the block's OWN statement tokens.
 *
 *  Deliberately NOT block.span, which (document.ts rule 11) covers the block
 *  through its last descendant - a Claim's block span swallows its whole
 *  body, so a caret inside the body would resolve to the claim's goal
 *  statement instead of to the line it is actually on. A token-less block
 *  (`?: {`) gets a zero-width span that no caret can match, which is right:
 *  there is no expression there to select. */
function statementSpan(block: Block, tokens: Token[]): Span {
  if (tokens.length === 0) {
    return { startLine: block.span.startLine, startCol: block.span.startCol, endLine: block.span.startLine, endCol: block.span.startCol };
  }
  const first = tokens[0].span;
  const last = tokens[tokens.length - 1].span;
  return { startLine: first.startLine, startCol: first.startCol, endLine: last.endLine, endCol: last.endCol };
}

// ---- compile ----

/**
 * The whole pipeline: lex -> parseDocument -> parse each statement once ->
 * renderDocument. Never throws (every stage below recovers internally);
 * malformed input comes back as diagnostics plus best-effort output.
 */
export function compile(source: string): EngineResult {
  const { tokens, diagnostics: lexDiagnostics } = lex(source);
  // ONE array from here on: every later stage appends to it.
  const diagnostics: Diagnostic[] = [...lexDiagnostics];
  const ast = parseDocument(tokens, diagnostics);

  const index: StatementIndexEntry[] = [];
  // Keyed by block object identity - these are the very Block objects inside
  // `ast`, never copies, so renderDocument's own walk finds them again.
  const parsed = new Map<Block, ParsedSegment[]>();

  // Same shape of walk as renderDocument's, so `indent` is the depth the
  // renderer indents that statement by (a Claim's children are one deeper
  // than the claim line itself).
  const walk = (blocks: Block[], depth: number): void => {
    for (const block of blocks) {
      if (block.kind === 'Statement' || block.kind === 'Claim') {
        const statementTokens = (block as Block & StatementTokens).tokens ?? [];
        const segments = parseStatement(statementTokens, diagnostics);
        parsed.set(block, segments);
        index.push({
          blockKind: block.kind,
          line: block.span.startLine,
          indent: depth,
          segments,
          span: statementSpan(block, statementTokens),
        });
      }
      if (block.kind === 'Scope' || block.kind === 'Subtask' || block.kind === 'Claim') {
        walk(block.children, depth + 1);
      }
    }
  };
  walk(ast.blocks, 0);

  const latexLines = renderDocument(ast, diagnostics, parsed);
  return { latexLines, macros: ast.macros, diagnostics, ast, index, sourceLines: source.split('\n') };
}

// ---- nodeAt ----

/** Root -> smallest-containing-node path, or null when the caret is outside
 *  `root` entirely. Descends into the first child that contains the caret;
 *  spans nest, so the first containing child is the only one, and the node
 *  reached when no child matches is the smallest containing node. Returning
 *  the whole path is what lets nodeAt walk back up without parent pointers. */
function pathToCaret(root: Expr, line: number, col: number): Expr[] | null {
  if (!spanContains(root.span, line, col)) return null;
  const path: Expr[] = [root];
  let current = root;
  for (;;) {
    const child = childrenOf(current).find((c) => spanContains(c.span, line, col));
    if (!child) return path;
    path.push(child);
    current = child;
  }
}

/**
 * Strict caret lookup in NORMALIZED (line, col) coordinates: the smallest
 * expression containing the caret, lifted to the nearest enclosing
 * STRUCTURAL node (itself, if it already is one). Returns null for a caret
 * that is on prose, inside an unparseable Raw run, between statements, past
 * the end of its statement (spans are end-exclusive), or in a subtree with
 * no structural node above it (a lone `x` is not worth selecting).
 *
 * Internal - see "The caret model" above. Callers go through the public
 * nodeAt() below, which maps raw editor coordinates onto this function's
 * coordinates and adds the end-of-statement retry.
 */
function nodeAtNormalized(result: EngineResult, line: number, col: number): NodeHit | null {
  const entry = result.index.find((e) => spanContains(e.span, line, col));
  if (!entry) return null;

  for (const segment of entry.segments) {
    if (segment.kind !== 'math' || !segment.expr) continue;
    const path = pathToCaret(segment.expr, line, col);
    if (!path) continue;
    // A Raw node is text the parser could not make sense of; there is no
    // structure under the caret to select, and reporting its parent would
    // claim a precision the parse does not have.
    if (path[path.length - 1].kind === 'Raw') return null;
    for (let i = path.length - 1; i >= 0; i--) {
      if (STRUCTURAL_KINDS.has(path[i].kind)) return { expr: path[i], statement: entry };
    }
    return null;
  }
  return null;
}

/**
 * The node under the caret. `(line, col)` is in the EDITOR's own RAW
 * coordinates (see "The caret model" above): this maps `col` through
 * normalizedCol() against the matching raw source line and runs the strict
 * lookup above.
 *
 * A strict miss retries once at `col - 1` (re-mapped the same way) before
 * giving up - the "character-behind" convention that makes a caret sitting
 * right after the last character the user just typed (one column past a
 * statement's end-exclusive span) still resolve to the node that character
 * belongs to, instead of nothing.
 */
export function nodeAt(result: EngineResult, line: number, col: number): NodeHit | null {
  const rawLine = result.sourceLines[line - 1] ?? '';
  const hit = nodeAtNormalized(result, line, normalizedCol(rawLine, col));
  if (hit) return hit;
  return col > 0 ? nodeAtNormalized(result, line, normalizedCol(rawLine, col - 1)) : null;
}

// ---- renderLineWithHighlight (the Task 11 hook) ----

/**
 * Re-renders JUST the statement under the caret, with the node nodeAt()
 * resolved wrapped in \htmlClass{hl-node}{...}. `(line, col)` are forwarded
 * to nodeAt() as-is, so they are RAW editor coordinates too. The view swaps
 * this string in for that one line's LaTeX; every other line is untouched,
 * and no stage of the pipeline re-runs (the entry's segments are already
 * parsed).
 *
 * Returns null exactly when nodeAt does.
 */
export function renderLineWithHighlight(
  result: EngineResult,
  line: number,
  col: number,
): { line: number; latex: string } | null {
  const hit = nodeAt(result, line, col);
  if (!hit) return null;
  const entry = hit.statement;
  return {
    line: entry.line,
    latex: renderStatementLine(entry.blockKind, entry.segments, entry.indent, { span: hit.expr.span }),
  };
}
