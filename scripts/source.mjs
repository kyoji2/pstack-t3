import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { safePath } from './files.mjs';

export const REPOSITORY = 'https://github.com/cursor/plugins.git';
export const GENERATOR = 'scripts/generate-pstack-harness-trees.mjs';

function git(cache, args, options = {}) {
  return execFileSync('git', ['--git-dir', cache, ...args], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

export function validateLock(lock) {
  if (lock.version !== 1 || lock.repository !== REPOSITORY || lock.source !== 'pstack' || !/^[a-f0-9]{40}$/.test(lock.commit)) {
    throw new Error('Invalid upstream.lock.json. Expected the official repository, pstack source, and a full commit SHA.');
  }
}

export function fetchSource(root, ref) {
  if (!ref || ref.startsWith('-') || /[\s\x00-\x1f]/.test(ref)) throw new Error('Invalid upstream ref.');
  const cache = join(root, '.cache', 'upstream.git');
  if (!existsSync(cache)) {
    mkdirSync(join(root, '.cache'), { recursive: true });
    execFileSync('git', ['init', '--bare', cache], { stdio: 'pipe' });
  }
  try { git(cache, ['fetch', '--no-tags', '--depth=1', REPOSITORY, ref]); }
  catch (error) { throw new Error(`Upstream fetch failed: ${error.stderr?.toString().trim() || error.message}`); }
  return git(cache, ['rev-parse', 'FETCH_HEAD^{commit}']).toString().trim();
}

export function loadSource(root, lock) {
  validateLock(lock);
  const cache = join(root, '.cache', 'upstream.git');
  if (!existsSync(cache)) throw new Error('Locked source is not cached. Run sync-pstack-t3 fetch.');
  try { git(cache, ['cat-file', '-e', `${lock.commit}^{commit}`]); }
  catch { throw new Error(`Locked commit ${lock.commit} is not cached. Run sync-pstack-t3 fetch.`); }
  const records = git(cache, ['ls-tree', '-r', '-z', lock.commit, '--', lock.source, GENERATOR]).toString().split('\0').filter(Boolean);
  const files = new Map();
  for (const record of records) {
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Invalid Git tree record.');
    const [, mode, type, object, path] = match;
    safePath(path);
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error(`Unsupported upstream file mode ${mode}: ${path}`);
    files.set(path, { bytes: git(cache, ['cat-file', 'blob', object]), executable: mode === '100755' });
  }
  if (!files.has(GENERATOR) || !files.has('pstack/LICENSE') || !files.has('pstack/skills/poteto-mode/SKILL.md')) {
    throw new Error('Upstream layout changed: generator, license, or poteto-mode is missing.');
  }
  return files;
}
