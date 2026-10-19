import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { readJson, readTree } from '../scripts/files.mjs';
import { install } from '../scripts/install.mjs';

const root = new URL('..', import.meta.url).pathname;
const inline = /\]\((<[^>\n]+>|[^\s)]+)/g;
const reference = /^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm;

function localTargets(text) {
  return [...text.matchAll(inline), ...text.matchAll(reference)]
    .map((match) => match[1].replace(/^<|>$/g, ''))
    .filter((href) => !/^(?:[a-z][a-z0-9+.-]*:|#|\?)/i.test(href))
    .map((href) => decodeURIComponent(href.replace(/[?#].*$/, '')))
    .filter(Boolean);
}

test('every relative link resolves from the installed symlink path without realpath', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'pstack-t3-links-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const target = join(base, 'skills');
  install(readTree(join(root, 'generated')), { target, stateRoot: join(base, 'state') });
  const placeholders = readJson(join(root, 'adapter', 'rules.json')).linkPlaceholders;
  const files = [...readTree(join(root, 'generated'))].filter(([path]) => path.startsWith('skills/') && path.endsWith('.md'));
  assert.ok(files.length > 50);
  const broken = [];
  for (const [path, file] of files) {
    const [, name, ...rest] = path.split('/');
    const linked = join(target, name, ...rest);
    for (const href of localTargets(file.bytes.toString('utf8'))) {
      if (placeholders.some((item) => item.path === path && item.href === href)) continue;
      const literal = isAbsolute(href) ? href : resolve(dirname(linked), href);
      if (!existsSync(literal)) broken.push(`${path} -> ${href}`);
    }
  }
  assert.deepEqual(broken, []);
  assert.ok(readlinkSync(join(target, 'pstack-t3-adapter')).endsWith('/skills/pstack-t3-adapter'));
});

test('every skill entry point points at the adapter and the adapter documents T3 detection', () => {
  const tree = readTree(join(root, 'generated'));
  const entries = [...tree.keys()].filter((path) => /^skills\/[^/]+\/SKILL\.md$/.test(path) && path !== 'skills/pstack-t3-adapter/SKILL.md');
  assert.ok(entries.length > 50);
  for (const path of entries) assert.ok(tree.get(path).bytes.toString().includes('](../pstack-t3-adapter/SKILL.md)'), path);
  const adapter = readFileSync(join(root, 'generated', 'skills', 'pstack-t3-adapter', 'SKILL.md'), 'utf8');
  assert.match(adapter, /^disable-model-invocation: true$/m);
  assert.match(adapter, /## Detect T3 Code/);
  assert.match(adapter, /<!-- covers:deslop -->/);
});
