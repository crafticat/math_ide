// esbuild bundler helper for engine tests.
//
// Bundles a TypeScript entry point (under services/engine/) to a single ESM
// file under .test-build/ so tests can `await import()` the real compiled
// module instead of re-implementing it. All paths are resolved to absolute
// paths (independent of process.cwd()) so this works whether tests are run
// via `node tests/engine/test-x.mjs` from the repo root or from elsewhere.
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const BUILD_DIR = resolve(REPO_ROOT, '.test-build');
const ESBUILD_BIN = resolve(REPO_ROOT, 'node_modules/.bin/esbuild');

// entry: path to a .ts entry point, relative to the repo root (or absolute).
// out: output filename (e.g. 'language.mjs'), written under .test-build/.
// Returns an absolute file:// URL suitable for `await import()`.
export const bundle = (entry, out) => {
  mkdirSync(BUILD_DIR, { recursive: true });
  const entryAbs = resolve(REPO_ROOT, entry);
  const outAbs = resolve(BUILD_DIR, out);
  execFileSync(ESBUILD_BIN, [entryAbs, '--bundle', '--format=esm', `--outfile=${outAbs}`], { stdio: 'pipe' });
  return pathToFileURL(outAbs).href;
};
