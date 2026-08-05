// ============================================
// Editor Tests - Syntax Highlighting & Autocomplete
// ============================================

import { AUTOCOMPLETE_DATA } from './constants.ts';

// ============================================
// AUTOCOMPLETE TESTS
// ============================================

const autocompleteTests = [
  // Functions should have autocomplete entries
  { trigger: 'sqrt', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'integral', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'sum', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'lim', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'frac', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'matrix', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'cases', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'floor', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'ceil', shouldExist: true, category: 'Autocomplete' },

  // Scopes should have autocomplete entries
  { trigger: 'Problem', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'Theorem', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'Proof', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'Lemma', shouldExist: true, category: 'Autocomplete' },

  // Greek letters
  { trigger: 'alpha', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'beta', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'gamma', shouldExist: true, category: 'Autocomplete' },

  // Symbols
  { trigger: 'forall', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'exists', shouldExist: true, category: 'Autocomplete' },
  { trigger: 'in', shouldExist: true, category: 'Autocomplete' },
];

// ============================================
// SYNTAX HIGHLIGHTING TESTS
// ============================================

// Mock theme colors for testing
const mockColors = {
  comment: '#6b6358',
  keyword: '#d4a373',
  mathSymbol: '#87aecd',
  greek: '#d4a5a5',
  operator: '#d4a373',
  number: '#b8c4a0',
  mathPackage: '#a8c686',
  function: '#a8c686',
  string: '#c9a227',
  bracket: '#c9a227',
};

// Simple HTML escape for testing
const escapeHtml = (unsafe) => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Simplified highlight function for testing (mirrors Editor.tsx logic)
function testHighlight(line) {
  if (line.trim().startsWith('//')) {
    return `<span style="color: ${mockColors.comment};">${escapeHtml(line)}</span>`;
  }

  let processed = escapeHtml(line);

  // Mark single-letter variables with placeholders
  const varPlaceholders = [];
  let varCounter = 0;
  processed = processed.replace(/(?<![a-zA-Z])([a-zA-Z])(?![a-zA-Z])/g, (match, letter) => {
    const placeholder = `@VAR${varCounter}@`;
    varPlaceholders.push({ placeholder, letter });
    varCounter++;
    return placeholder;
  });

  // Operators - before entities are hidden, since `-&gt;` IS an entity
  processed = processed.replace(/(-&gt;|=&gt;|&lt;=&gt;|!=|&lt;=|&gt;=|\+-|-\+)/g,
    `<span style="color: ${mockColors.operator};">$1</span>`
  );

  // Hide HTML entities from the passes below (the number pass would otherwise
  // match the `039` inside `&#039;` and split the entity in half)
  const entPlaceholders = [];
  let entCounter = 0;
  processed = processed.replace(/&[#a-zA-Z0-9]+;/g, (entity) => {
    const placeholder = `@ENT${entCounter}@`;
    entPlaceholders.push({ placeholder, entity });
    entCounter++;
    return placeholder;
  });

  // Scope Keywords
  const scopeKeywords = ['Problem', 'Theorem', 'Proof', 'Case', 'Lemma', 'Let', 'Then'];
  scopeKeywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'g');
    processed = processed.replace(regex, `<span style="color: ${mockColors.keyword};">${kw}</span>`);
  });

  // Math Functions
  const mathFunctions = ['sqrt', 'integral', 'sum', 'lim', 'sin', 'cos', 'log', 'floor', 'ceil'];
  mathFunctions.forEach(fn => {
    const regex = new RegExp(`\\b${fn}\\b`, 'g');
    processed = processed.replace(regex, `<span style="color: ${mockColors.function};">${fn}</span>`);
  });

  // Math Symbols
  const mathSymbols = ['exists', 'forall', 'in', 'notin', 'subset', 'AND', 'OR', 'NOT'];
  mathSymbols.forEach(sym => {
    const regex = new RegExp(`\\b${sym}\\b`, 'g');
    processed = processed.replace(regex, `<span style="color: ${mockColors.mathSymbol};">${sym}</span>`);
  });

  // Greek Letters
  const greekLetters = ['alpha', 'beta', 'gamma', 'delta', 'pi', 'theta'];
  greekLetters.forEach(letter => {
    const regex = new RegExp(`\\b${letter}\\b`, 'g');
    processed = processed.replace(regex, `<span style="color: ${mockColors.greek};">${letter}</span>`);
  });

  // Numbers
  processed = processed.replace(/(\b\d+\.?\d*\b)/g, `<span style="color: ${mockColors.number};">$1</span>`);

  // Restore HTML entities
  entPlaceholders.forEach(({ placeholder, entity }) => {
    processed = processed.replace(placeholder, entity);
  });

  // Restore single-letter variable placeholders
  varPlaceholders.forEach(({ placeholder, letter }) => {
    processed = processed.replace(placeholder, `<span style="color: ${mockColors.mathSymbol};">${letter}</span>`);
  });

  return processed;
}

const highlightTests = [
  // Comments
  {
    input: '// This is a comment',
    shouldContain: `color: ${mockColors.comment}`,
    description: 'Comments should be highlighted',
    category: 'Highlighting'
  },

  // Keywords
  {
    input: 'Problem 1 {',
    shouldContain: `color: ${mockColors.keyword}`,
    description: 'Problem keyword should be highlighted',
    category: 'Highlighting'
  },
  {
    input: 'Theorem {',
    shouldContain: `color: ${mockColors.keyword}`,
    description: 'Theorem keyword should be highlighted',
    category: 'Highlighting'
  },

  // Functions
  {
    input: 'sqrt(x)',
    shouldContain: `color: ${mockColors.function}`,
    description: 'sqrt function should be highlighted',
    category: 'Highlighting'
  },
  {
    input: 'integral(0 -> 1)',
    shouldContain: `color: ${mockColors.function}`,
    description: 'integral function should be highlighted',
    category: 'Highlighting'
  },
  {
    input: 'sin(x) + cos(x)',
    shouldContain: `color: ${mockColors.function}`,
    description: 'trig functions should be highlighted',
    category: 'Highlighting'
  },

  // Math symbols
  {
    input: 'forall x',
    shouldContain: `color: ${mockColors.mathSymbol}`,
    description: 'forall should be highlighted',
    category: 'Highlighting'
  },
  {
    input: 'exists y',
    shouldContain: `color: ${mockColors.mathSymbol}`,
    description: 'exists should be highlighted',
    category: 'Highlighting'
  },
  {
    input: 'x in A',
    shouldContain: `color: ${mockColors.mathSymbol}`,
    description: 'in should be highlighted',
    category: 'Highlighting'
  },

  // Greek letters
  {
    input: 'alpha + beta',
    shouldContain: `color: ${mockColors.greek}`,
    description: 'Greek letters should be highlighted',
    category: 'Highlighting'
  },
  {
    input: 'theta = pi/2',
    shouldContain: `color: ${mockColors.greek}`,
    description: 'theta and pi should be highlighted',
    category: 'Highlighting'
  },

  // Numbers
  {
    input: 'x = 42',
    shouldContain: `color: ${mockColors.number}`,
    description: 'Numbers should be highlighted',
    category: 'Highlighting'
  },
  {
    input: '3.14159',
    shouldContain: `color: ${mockColors.number}`,
    description: 'Decimal numbers should be highlighted',
    category: 'Highlighting'
  },

  // Standalone single-letter variables
  {
    input: 'x notin A',
    shouldContain: `color: ${mockColors.mathSymbol}`,
    description: 'Standalone x should be highlighted',
    category: 'Variables'
  },
  {
    input: 'a + b = c',
    shouldContain: `color: ${mockColors.mathSymbol}`,
    description: 'Variables in equation should be highlighted',
    category: 'Variables'
  },
  {
    input: 'Let f be continuous',
    shouldContain: `color: ${mockColors.mathSymbol}`,
    description: 'Single letter f should be highlighted',
    category: 'Variables'
  },

  // No breaking HTML
  {
    input: 'Problem {',
    shouldNotContain: '<<',
    description: 'Should not create broken HTML with double <',
    category: 'HTMLSafety'
  },
  {
    input: 'sqrt(x)',
    shouldNotContain: 'span style="color: <',
    description: 'Should not have broken nested tags',
    category: 'HTMLSafety'
  },

  // HTML entities must survive every highlighting pass intact. The apostrophe
  // escapes to `&#039;`, whose digits the number pass used to match and wrap,
  // splitting the entity so the editor printed a literal `&#039;`.
  {
    input: "F'(x)",
    shouldNotContain: '&#<span',
    description: 'Apostrophe entity must not be split open by the number pass',
    category: 'HTMLSafety'
  },
  {
    input: "F'(x)",
    shouldContain: '&#039;',
    description: 'Apostrophe survives as one intact entity',
    category: 'HTMLSafety'
  },

  // Operators are spelled with entities too (`-&gt;`), so entity protection
  // must not run before they are matched.
  {
    input: 'x -> y',
    shouldContain: `color: ${mockColors.operator}`,
    description: 'Arrow operator is still highlighted alongside entity protection',
    category: 'Highlighting'
  },
];

// ============================================
// TEST RUNNER
// ============================================

function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       MathBrain Editor - Autocomplete & Highlighting Tests   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;
  const failures = [];
  const categories = {};

  // Run autocomplete tests
  console.log('Testing Autocomplete Data...\n');

  autocompleteTests.forEach((test, index) => {
    const exists = AUTOCOMPLETE_DATA.some(item =>
      item.trigger === test.trigger || item.label === test.trigger
    );

    const testPassed = exists === test.shouldExist;

    if (!categories[test.category]) {
      categories[test.category] = { passed: 0, total: 0 };
    }
    categories[test.category].total++;

    if (testPassed) {
      passed++;
      categories[test.category].passed++;
    } else {
      failed++;
      failures.push({
        test: `Autocomplete: ${test.trigger}`,
        expected: test.shouldExist ? 'should exist' : 'should not exist',
        actual: exists ? 'exists' : 'does not exist'
      });
    }
  });

  // Run highlighting tests
  console.log('Testing Syntax Highlighting...\n');

  highlightTests.forEach((test, index) => {
    const result = testHighlight(test.input);
    let testPassed = false;

    if (test.shouldContain) {
      testPassed = result.includes(test.shouldContain);
    } else if (test.shouldNotContain) {
      testPassed = !result.includes(test.shouldNotContain);
    }

    if (!categories[test.category]) {
      categories[test.category] = { passed: 0, total: 0 };
    }
    categories[test.category].total++;

    if (testPassed) {
      passed++;
      categories[test.category].passed++;
    } else {
      failed++;
      failures.push({
        test: test.description,
        input: test.input,
        expected: test.shouldContain ? `contains: ${test.shouldContain}` : `not contains: ${test.shouldNotContain}`,
        actual: result.substring(0, 100) + (result.length > 100 ? '...' : '')
      });
    }
  });

  // Print category summary
  console.log('Category Summary:');
  console.log('──────────────────────────────────────────────────');
  Object.entries(categories).forEach(([category, stats]) => {
    const status = stats.passed === stats.total ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`${status} ${category.padEnd(15)} ${stats.passed}/${stats.total} passed`);
  });

  console.log('\n══════════════════════════════════════════════════\n');
  console.log(`Total: ${passed}/${passed + failed} tests passed\n`);

  if (failures.length > 0) {
    console.log(`\x1b[31m${failures.length} FAILED:\x1b[0m\n`);
    failures.forEach(f => {
      console.log(`  ${f.test}`);
      if (f.input) console.log(`    Input:    ${f.input}`);
      console.log(`    Expected: ${f.expected}`);
      console.log(`    Actual:   ${f.actual}\n`);
    });
    process.exit(1);
  } else {
    console.log('\x1b[32m✓ All tests passed!\x1b[0m');
    process.exit(0);
  }
}

runTests();
