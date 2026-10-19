import { posix, join } from 'node:path';
import { entry, hash, json, readJson, readTree, safePath } from './files.mjs';
import { GENERATOR, validateLock } from './source.mjs';

const ADAPTER_DIR = 'skills/pstack-t3-adapter';

export function loadAdapter(root) {
  const local = readTree(join(root, 'adapter'));
  const rules = readJson(join(root, 'adapter', 'rules.json'));
  const overrides = readTree(join(root, 'overrides'));
  if (!local.has('SKILL.md')) throw new Error('Missing adapter/SKILL.md.');
  return { local, rules, overrides };
}

export function requirements(source, rules) {
  const found = {};
  for (const term of rules.requirements) {
    const pattern = new RegExp(term.pattern, term.flags || '');
    found[term.id] = [...source].filter(([path, file]) => path.startsWith('pstack/skills/') && path.endsWith('.md') && pattern.test(file.bytes.toString('utf8'))).map(([path]) => path).sort();
  }
  return found;
}

export function roles(source) {
  const text = source.get('pstack/skills/setup-pstack/SKILL.md')?.bytes.toString('utf8') || '';
  const block = /# pstack model configuration[\s\S]*?```/.exec(text)?.[0] || '';
  return [...block.matchAll(/^([a-z][a-z ,\-]+):\s+.+$/gm)].map((match) => match[1]);
}

function has(files, path) {
  return files.has(path) || [...files.keys()].some((file) => file.startsWith(`${path}/`));
}

function rewriteLinks(text, from, source, output, lock, placeholders) {
  function rewrite(href) {
    const angled = href.startsWith('<');
    const value = angled ? href.slice(1, -1) : href;
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\?)/i.test(value)) return href;
    if (placeholders.some((item) => item.path === from && item.href === value)) return href;
    const match = /^([^?#]*)([\s\S]*)$/.exec(value);
    let target;
    try { target = decodeURIComponent(match[1]); } catch { throw new Error(`Invalid link encoding in ${from}: ${value}`); }
    if (!target) return href;
    if (target.includes('\\') || target.startsWith('/')) throw new Error(`Unsafe local link in ${from}: ${value}`);
    const resolved = posix.normalize(posix.join(posix.dirname(from), target)).replace(/\/$/, '');
    safePath(resolved);
    if (has(output, resolved)) return href;
    const upstreamPath = `pstack/${resolved}`;
    if (!has(source, upstreamPath)) throw new Error(`Unresolved local link in ${from}: ${value}`);
    const kind = source.has(upstreamPath) ? 'blob' : 'tree';
    const encoded = upstreamPath.split('/').map(encodeURIComponent).join('/');
    const remote = `https://github.com/cursor/plugins/${kind}/${lock.commit}/${encoded}${match[2]}`;
    return angled ? `<${remote}>` : remote;
  }
  return text.replace(/(\]\()(<[^>\n]+>|[^\s)]+)([^)\n]*\))/g, (_, before, href, after) => `${before}${rewrite(href)}${after}`)
    .replace(/^(\s{0,3}\[[^\]\n]+\]:\s*)(<[^>\n]+>|\S+)(.*)$/gm, (_, before, href, after) => `${before}${rewrite(href)}${after}`);
}

function inject(text, name) {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
  const declared = frontmatter && /^name:\s*["']?([^\n"']+)["']?\s*$/m.exec(frontmatter[0]);
  if (!declared || declared[1].trim().toLowerCase().replace(/\s+/g, '-') !== name) {
    throw new Error(`Invalid skill frontmatter: ${name}`);
  }
  const header = frontmatter[0].replace(/^name:.*$/m, `name: ${name}`);
  const notice = '<!-- pstack-t3 adapter -->\nBefore following this skill, read [the T3 adapter](../pstack-t3-adapter/SKILL.md). Its platform mappings apply to this skill and its linked files. If you cannot read it, stop and tell the user.\n';
  if (text.includes('<!-- pstack-t3 adapter -->')) throw new Error(`Unexpected adapter marker in input: ${name}`);
  return `${header}\n${notice}\n${text.slice(frontmatter[0].length).replace(/^\s*\n/, '')}`;
}

export function render(source, lock, adapter) {
  validateLock(lock);
  const { local, rules, overrides } = adapter;
  const guide = local.get('SKILL.md').bytes.toString('utf8');
  const problems = [];
  for (const [path, reviewed] of Object.entries(rules.reviewedSources)) {
    const file = source.get(path);
    if (!file || hash(file.bytes) !== reviewed) problems.push(`Review required for ${path}. Inspect the candidate source and update adapter/rules.json after review.`);
  }
  const found = requirements(source, rules);
  for (const [id, paths] of Object.entries(found)) {
    if (paths.length && !guide.includes(`<!-- covers:${id} -->`)) problems.push(`Adapter has no mapping for ${id}, used by ${paths.join(', ')}.`);
  }
  for (const [path] of overrides) {
    if (!Object.hasOwn(rules.overrides, path)) problems.push(`Undeclared override: ${path}`);
  }
  for (const [path, baseline] of Object.entries(rules.overrides)) {
    safePath(path);
    if (!overrides.has(path)) problems.push(`Missing override: ${path}`);
    const original = source.get(`pstack/${path}`);
    if (!original || hash(original.bytes) !== baseline) problems.push(`Override review required for pstack/${path}. Update its baseline after reviewing the upstream change.`);
  }
  if (problems.length) throw new Error(problems.join('\n'));

  const files = new Map();
  const origins = {};
  for (const [path, file] of source) {
    if (!path.startsWith('pstack/skills/') && !path.startsWith('pstack/agents/') && path !== 'pstack/LICENSE') continue;
    const out = safePath(path.startsWith('pstack/agents/') ? `${ADAPTER_DIR}/${path.slice('pstack/'.length)}` : path.slice('pstack/'.length));
    files.set(out, { ...file });
    origins[out] = { source: path, sourceHash: hash(file.bytes), transform: 'copy' };
  }
  for (const [path, file] of overrides) {
    files.set(path, { ...file });
    origins[path] = { source: `pstack/${path}`, override: `overrides/${path}`, sourceHash: rules.overrides[path], overrideHash: hash(file.bytes), transform: 'override' };
  }
  for (const [path, file] of files) {
    if (/^skills\/[^/]+\/SKILL\.md$/.test(path)) {
      const text = file.bytes.toString('utf8');
      files.set(path, entry(inject(text, path.split('/')[1]), file.executable));
      origins[path].adapterInjected = true;
      const declared = /^name:\s*(.+)$/m.exec(text)?.[1];
      if (declared !== path.split('/')[1]) origins[path].originalFrontmatterName = declared;
    }
  }
  if (files.has(`${ADAPTER_DIR}/SKILL.md`)) throw new Error(`Upstream already provides ${ADAPTER_DIR}.`);
  files.set(`${ADAPTER_DIR}/SKILL.md`, local.get('SKILL.md'));
  origins[`${ADAPTER_DIR}/SKILL.md`] = { source: 'adapter/SKILL.md', transform: 'copy' };
  for (const [path, file] of files) {
    if (path.endsWith('.md')) files.set(path, entry(rewriteLinks(file.bytes.toString('utf8'), path, source, files, lock, rules.linkPlaceholders || []), file.executable));
  }
  const inputs = Object.fromEntries([...local].sort().map(([path, file]) => [`adapter/${path}`, hash(file.bytes)]));
  const provenance = {
    format: 1,
    upstream: lock,
    inputs,
    requirements: found,
    roles: roles(source),
    files: Object.fromEntries([...files].sort().map(([path, file]) => [path, { ...origins[path], sha256: hash(file.bytes), executable: file.executable }])),
  };
  files.set('provenance.json', entry(json(provenance)));
  return new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function updateReport(before, after, oldLock, newLock, adapter) {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes = paths.flatMap((path) => {
    const a = before.get(path); const b = after.get(path);
    if (a && b && a.bytes.equals(b.bytes) && a.executable === b.executable) return [];
    const highImpact = adapter.rules.highImpact.some((pattern) => new RegExp(pattern).test(path));
    return [{ path, change: !a ? 'added' : !b ? 'removed' : 'modified', highImpact, override: path.startsWith('pstack/') && Object.hasOwn(adapter.rules.overrides, path.slice(7)) }];
  });
  const oldTerms = requirements(before, adapter.rules);
  const newTerms = requirements(after, adapter.rules);
  return {
    from: oldLock.commit, to: newLock.commit, changes,
    newRequirements: Object.keys(newTerms).filter((key) => newTerms[key].length && !oldTerms[key].length),
    roles: { before: roles(before), after: roles(after) },
    upstreamGeneratorChanged: changes.some(({ path }) => path === GENERATOR),
  };
}
