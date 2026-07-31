// ---- Spans ----
export interface Span { startLine: number; startCol: number; endLine: number; endCol: number; } // 1-based lines, 0-based cols, end exclusive

// ---- Tokens ----
export type TokenKind =
  | 'WORD' | 'NUMBER' | 'OP' | 'PUNCT' | 'LPAREN' | 'RPAREN' | 'LBRACKET' | 'RBRACKET'
  | 'LBRACE' | 'RBRACE' | 'STRING' | 'MATH_QUOTE' | 'COMMENT' | 'NEWLINE';
export interface Token { kind: TokenKind; text: string; span: Span; }
// OP tokens (single token each): -> => <=> != <= >= +- -+ + - * / = < > ^ _ ' | : ; , .
// STRING: text is the INNER content (no quotes). MATH_QUOTE: inner content (no dollars).

// ---- Diagnostics ----
export interface Diagnostic { span: Span; severity: 'info' | 'warn'; message: string; hint?: string; }

// ---- Expression AST ----
export type Expr =
  | { kind: 'Num'; value: string; span: Span }
  | { kind: 'Var'; name: string; span: Span } // single letter
  | { kind: 'Ident'; name: string; span: Span } // multi-char math identifier -> \mathrm
  | { kind: 'Sym'; name: string; latex: string; span: Span } // greek / keyword symbols (from language tables)
  | { kind: 'Text'; text: string; span: Span } // prose run
  | { kind: 'BinOp'; op: string; left: Expr; right: Expr; span: Span } // + - * juxt (op: '+', '-', 'cdot', 'juxt', 'pm', 'mp', 'land', 'lor', 'cup', 'cap', 'mid', 'to')
  | { kind: 'UnaryOp'; op: string; operand: Expr; span: Span } // 'neg' (minus), 'lnot'
  | { kind: 'Prime'; operand: Expr; count: number; span: Span }
  | { kind: 'Frac'; num: Expr; den: Expr; span: Span }
  | { kind: 'Pow'; base: Expr; exp: Expr; span: Span }
  | { kind: 'Sub'; base: Expr; sub: Expr; span: Span }
  | { kind: 'Call'; fn: string; args: Expr[]; span: Span } // sin, sqrt, floor, choose, factorial, det, accents, overline, ray, arc...
  | { kind: 'BigOp'; op: 'sum' | 'integral' | 'lim'; from: Expr | null; to: Expr | null; span: Span }
  | { kind: 'SetLiteral'; elements: Expr[]; span: Span }
  | { kind: 'SetBuilder'; element: Expr; condition: Expr; span: Span }
  | { kind: 'Abs'; operand: Expr; span: Span }
  | { kind: 'AngleVector'; elements: Expr[]; span: Span }
  | { kind: 'Group'; operand: Expr; bracket: '(' | '['; span: Span } // explicit user parens kept for rendering
  | { kind: 'Matrix'; env: 'pmatrix' | 'bmatrix' | 'vmatrix'; rows: Expr[][]; span: Span }
  | { kind: 'Cases'; branches: { value: Expr; condition: Expr | null }[]; span: Span }
  | { kind: 'Relation'; ops: string[]; operands: Expr[]; span: Span } // n-ary chain: operands.length === ops.length + 1; ops from: = != < > <= >= in notin subset congruent similar parallel perp corresponds implies iff
  | { kind: 'Raw'; text: string; span: Span }; // recovery: renders as \texttt

// ---- Statement segments ----
export type Segment = { kind: 'prose'; text: string; span: Span } | { kind: 'math'; expr: Expr; span: Span };

// ---- Document AST ----
export type Block =
  | { kind: 'Scope'; scopeType: string; title: string; styling: 'bold' | 'italic'; children: Block[]; span: Span }
  | { kind: 'Subtask'; depth: number; title: string; children: Block[]; span: Span } // depth = dash count (1-4)
  | { kind: 'Claim'; statement: Segment[]; children: Block[]; span: Span } // ?: syntax
  | { kind: 'Statement'; segments: Segment[]; span: Span }
  | { kind: 'Blank'; span: Span };
export interface DocumentAst { blocks: Block[]; macros: Record<string, string>; }

// ---- Engine API ----
export interface EngineLine { id: string; latex: string; originalLine: number; }
export interface HighlightRequest { line: number; col: number; }
export interface CompileResult {
  latexLines: EngineLine[];
  macros: Record<string, string>;
  diagnostics: Diagnostic[];
  ast: DocumentAst;
}
