import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite, diffTrees, entry, hash, json, publish, readTree, recoverPublication, treeId, withLock, writeTree } from '../scripts/files.mjs';
import { render, updateReport } from '../scripts/generate-t3-tree.mjs';
import { install, installationStatus, installPaths, recover, rollback } from '../scripts/install.mjs';
import { applyCandidate } from '../scripts/sync-upstream.mjs';
import { GENERATOR, loadSource, REPOSITORY } from '../scripts/source.mjs';

const lock = { version: 1, repository: REPOSITORY, source: 'pstack', commit: 'a'.repeat(40) };
const skill = (name, body = '') => `---\nname: ${name}\ndescription: A fixture skill.\n---\n\n# ${name}\n\n${body}\n`;
function fixture() {
  const source = new Map([
    [GENERATOR, entry('// fixture generator')],
    ['pstack/LICENSE', entry('upstream license')],
    ['pstack/agents/poteto-agent.md', entry('Read the mode.')],
    ['pstack/skills/poteto-mode/SKILL.md', entry(skill('Poteto Mode', 'Use `Task`. [Guide](../../docs/guide.md?view=1#setup)'))],
    ['pstack/skills/poteto-mode/run.sh', entry('#!/bin/sh\nexit 0\n', true)],
    ['pstack/skills/setup-pstack/SKILL.md', entry(skill('setup-pstack', '# pstack model configuration\nfeature, refactoring: auto\n```'))],
    ['pstack/docs/guide.md', entry('# Guide\n\n## Setup')],
  ]);
  const adapter = {
    local: new Map([['t3.md', entry('# T3\n<!-- covers:task -->\nRead the tool schema.')]]),
    overrides: new Map(),
    rules: { reviewedSources: { [GENERATOR]: hash(source.get(GENERATOR).bytes) }, overrides: {}, requirements: [{ id: 'task', pattern: '`Task`' }], highImpact: ['poteto-mode', 'generate-pstack'] },
  };
  return { source, adapter };
}
function sandbox(t) {
  const root = mkdtempSync(join(tmpdir(), 'pstack-t3-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function installedFiles(names = ['alpha'], text = 'v1') {
  return new Map([
    ['LICENSE', entry('upstream license')],
    ['docs/harness/t3.md', entry('# T3')],
    ...names.map((name) => [`skills/${name}/SKILL.md`, entry(skill(name, text))]),
  ]);
}
function installOptions(root) { return { target: join(root, 'skills'), stateRoot: join(root, 'state') }; }

test('generation pins omitted links, normalizes display names, retains permissions, and is deterministic', () => {
  const { source, adapter } = fixture();
  const first = render(source, lock, adapter);
  const second = render(source, lock, adapter);
  assert.equal(treeId(first), treeId(second));
  const mode = first.get('skills/poteto-mode/SKILL.md').bytes.toString();
  assert.match(mode, /name: poteto-mode/);
  assert.equal(mode.match(/<!-- pstack-t3 adapter -->/g).length, 1);
  assert.ok(mode.includes(`https://github.com/cursor/plugins/blob/${lock.commit}/pstack/docs/guide.md?view=1#setup`));
  assert.equal(first.get('skills/poteto-mode/run.sh').executable, true);
  const provenance = JSON.parse(first.get('provenance.json').bytes);
  assert.equal(provenance.files['skills/poteto-mode/SKILL.md'].originalFrontmatterName, 'Poteto Mode');
  assert.equal(provenance.files.LICENSE.sha256, hash('upstream license'));
  assert.deepEqual(provenance.roles, ['feature, refactoring']);
  assert.ok(!JSON.stringify(provenance).includes(tmpdir()));
});

test('drift includes removed files and executable permission changes', (t) => {
  const root = sandbox(t);
  const files = installedFiles();
  files.set('run.sh', entry('exit 0', true));
  writeTree(root, files);
  assert.deepEqual(diffTrees(files, readTree(root)), []);
  chmodSync(join(root, 'run.sh'), 0o644);
  writeFileSync(join(root, 'stale'), 'extra');
  assert.deepEqual(diffTrees(files, readTree(root)).map(({ path }) => path), ['run.sh', 'stale']);
});

test('missing adapter coverage, changed generator baselines, and changed overrides block generation', () => {
  const { source, adapter } = fixture();
  adapter.local.set('t3.md', entry('No coverage.'));
  assert.throws(() => render(source, lock, adapter), /no mapping for task/);
  adapter.local.set('t3.md', entry('<!-- covers:task -->'));
  source.set(GENERATOR, entry('changed'));
  assert.throws(() => render(source, lock, adapter), /Review required/);
  adapter.rules.reviewedSources[GENERATOR] = hash('changed');
  adapter.overrides.set('skills/setup-pstack/SKILL.md', entry(skill('setup-pstack')));
  adapter.rules.overrides['skills/setup-pstack/SKILL.md'] = '0'.repeat(64);
  assert.throws(() => render(source, lock, adapter), /Override review required/);
});

test('links that are missing, absolute, or escape the source fail', () => {
  for (const target of ['missing.md', '/private/file.md', '../../../../outside.md', '%2e%2e/%2e%2e/%2e%2e/outside.md']) {
    const { source, adapter } = fixture();
    source.set('pstack/skills/poteto-mode/SKILL.md', entry(skill('poteto-mode', `[bad](${target})`)));
    assert.throws(() => render(source, lock, adapter), /link|Unsafe/);
  }
});

test('source tree reader rejects symlinks', (t) => {
  const root = sandbox(t);
  symlinkSync('/etc/hosts', join(root, 'escape'));
  assert.throws(() => readTree(root), /Symlink/);
});

test('Git source reader rejects symlink blobs without executing upstream files', (t) => {
  const root = sandbox(t);
  const repo = join(root, 'source');
  mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' }).toString().trim();
  git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  writeTree(repo, new Map([
    [GENERATOR, entry('throw new Error("must not run")')],
    ['pstack/LICENSE', entry('license')],
    ['pstack/skills/poteto-mode/SKILL.md', entry(skill('poteto-mode'))],
  ]));
  symlinkSync('/etc/hosts', join(repo, 'pstack', 'escape'));
  git('add', '.'); git('commit', '-m', 'fixture');
  const commit = git('rev-parse', 'HEAD');
  mkdirSync(join(root, '.cache'));
  execFileSync('git', ['clone', '--bare', repo, join(root, '.cache', 'upstream.git')], { stdio: 'pipe' });
  assert.throws(() => loadSource(root, { ...lock, commit }), /Unsupported upstream file mode 120000/);
});

test('failed candidate validation preserves both lock and published tree and writes a report', (t) => {
  const root = sandbox(t);
  const { source, adapter } = fixture();
  const initial = render(source, lock, adapter);
  publish(root, initial, lock);
  const originalLock = readFileSync(join(root, 'upstream.lock.json'));
  const changed = new Map(source);
  changed.set(GENERATOR, entry('changed upstream rules'));
  assert.throws(() => applyCandidate(root, source, changed, { ...lock, commit: 'b'.repeat(40) }, adapter), /were not changed/);
  assert.deepEqual(readFileSync(join(root, 'upstream.lock.json')), originalLock);
  assert.equal(treeId(readTree(join(root, 'generated'))), treeId(initial));
  const report = JSON.parse(readFileSync(join(root, '.cache', 'update-report.json')));
  assert.equal(report.validation.passed, false);
  assert.equal(report.upstreamGeneratorChanged, true);
});

test('successful candidate update removes stale output and publishes matching lock', (t) => {
  const root = sandbox(t);
  const { source, adapter } = fixture();
  publish(root, render(source, lock, adapter), lock);
  writeFileSync(join(root, 'generated', 'stale'), 'old');
  const changed = new Map(source);
  changed.set('pstack/skills/new/SKILL.md', entry(skill('new')));
  const candidate = { ...lock, commit: 'b'.repeat(40) };
  const report = applyCandidate(root, source, changed, candidate, adapter);
  assert.equal(report.validation.passed, true);
  assert.equal(existsSync(join(root, 'generated', 'stale')), false);
  assert.equal(JSON.parse(readFileSync(join(root, 'upstream.lock.json'))).commit, candidate.commit);
  assert.equal(treeId(readTree(join(root, 'generated'))), treeId(render(changed, candidate, adapter)));
});

test('update report identifies high-impact content, new requirements, and changed roles', () => {
  const { source, adapter } = fixture();
  const before = new Map(source);
  before.set('pstack/skills/poteto-mode/SKILL.md', entry(skill('poteto-mode')));
  const report = updateReport(before, source, lock, { ...lock, commit: 'b'.repeat(40) }, adapter);
  assert.deepEqual(report.newRequirements, ['task']);
  assert.equal(report.changes[0].highImpact, true);
  assert.deepEqual(report.roles.after, ['feature, refactoring']);
});

test('the installer CLI rejects unsupported options', () => {
  assert.throws(() => execFileSync(process.execPath, [new URL('../bin/sync-pstack-t3.mjs', import.meta.url).pathname, 'install', '--migrate-from', '/unused'], { stdio: 'pipe' }), (error) => {
    assert.match(error.stderr.toString(), /Unexpected argument: --migrate-from/);
    return true;
  });
});

test('all installation collisions are checked before any link changes', (t) => {
  const root = sandbox(t);
  const options = installOptions(root);
  mkdirSync(options.target);
  mkdirSync(join(options.target, 'zeta'));
  assert.throws(() => install(installedFiles(['alpha', 'zeta']), options), /Unmanaged/);
  assert.equal(existsSync(join(options.target, 'alpha')), false);
  symlinkSync('/unrelated', join(options.target, 'alpha'));
  assert.throws(() => install(installedFiles(), options), /Unmanaged link/);
  assert.equal(readlinkSync(join(options.target, 'alpha')), '/unrelated');
});

test('installation and rollback preserve unrelated skills', (t) => {
  const root = sandbox(t);
  const options = installOptions(root);
  mkdirSync(options.target);
  mkdirSync(join(options.target, 'unrelated'));
  symlinkSync('/external/skill', join(options.target, 'external'));
  install(installedFiles(), options);
  assert.equal(lstatSync(join(options.target, 'unrelated')).isDirectory(), true);
  assert.equal(readlinkSync(join(options.target, 'external')), '/external/skill');
  rollback(options);
  assert.equal(existsSync(join(options.target, 'alpha')), false);
  assert.equal(lstatSync(join(options.target, 'unrelated')).isDirectory(), true);
  assert.equal(readlinkSync(join(options.target, 'external')), '/external/skill');
  assert.equal(installationStatus(options).skills, 0);
});

test('upgrades remove retired managed skills and rollback restores their exact version', (t) => {
  const root = sandbox(t);
  const options = installOptions(root);
  const first = install(installedFiles(['alpha', 'retired']), options);
  const oldLink = readlinkSync(join(options.target, 'retired'));
  install(installedFiles(['alpha', 'new'], 'v2'), options);
  assert.equal(existsSync(join(options.target, 'retired')), false);
  assert.equal(installationStatus(options).skills, 2);
  const result = rollback(options);
  assert.equal(result.version, first.version);
  assert.equal(readlinkSync(join(options.target, 'retired')), oldLink);
  assert.equal(existsSync(join(options.target, 'new')), false);
  assert.equal(install(installedFiles(['alpha', 'retired']), options).unchanged, true);
});

test('rollback refuses changed or missing links without modifying other paths', (t) => {
  const root = sandbox(t);
  const options = installOptions(root);
  install(installedFiles(['alpha', 'beta']), options);
  const original = readlinkSync(join(options.target, 'alpha'));
  rmSync(join(options.target, 'beta'));
  symlinkSync('/elsewhere', join(options.target, 'beta'));
  assert.throws(() => rollback(options), /Changed path/);
  assert.equal(readlinkSync(join(options.target, 'alpha')), original);
  assert.equal(readlinkSync(join(options.target, 'beta')), '/elsewhere');
});

test('installed version changes are detected', (t) => {
  const root = sandbox(t);
  const options = installOptions(root);
  install(installedFiles(), options);
  const file = join(options.target, 'alpha', 'SKILL.md');
  chmodSync(file, 0o644);
  writeFileSync(file, 'modified');
  assert.throws(() => installationStatus(options), /Installed version was modified/);
  assert.throws(() => install(installedFiles(), options), /Installed version was modified/);
});

test('recovery restores a partially applied journal and refuses unrelated modifications', (t) => {
  const root = sandbox(t);
  const options = installOptions(root);
  mkdirSync(options.target);
  const paths = installPaths(options.target, options.stateRoot);
  const journal = { version: 1, target: paths.target, before: { alpha: null, beta: null }, after: { alpha: '/new/alpha', beta: '/new/beta' }, manifestBefore: null };
  atomicWrite(paths.journal, json(journal));
  symlinkSync('/new/alpha', join(options.target, 'alpha'));
  symlinkSync('/unrelated', join(options.target, 'beta'));
  assert.throws(() => recover(options), /changed path/);
  assert.equal(readlinkSync(join(options.target, 'alpha')), '/new/alpha');
  rmSync(join(options.target, 'beta'));
  assert.equal(recover(options).recovered, true);
  assert.equal(existsSync(paths.journal), false);
  assert.throws(() => lstatSync(join(options.target, 'alpha')), { code: 'ENOENT' });
});

test('recovery refuses a manifest changed outside the interrupted transaction', (t) => {
  const root = sandbox(t);
  const options = installOptions(root);
  mkdirSync(options.target);
  const paths = installPaths(options.target, options.stateRoot);
  atomicWrite(paths.journal, json({ version: 1, target: paths.target, before: { alpha: null }, after: { alpha: '/new' }, manifestBefore: null, manifestAfter: { version: 1 } }));
  atomicWrite(paths.manifest, json({ user: 'modified' }));
  symlinkSync('/new', join(options.target, 'alpha'));
  assert.throws(() => recover(options), /manifest changed/);
  assert.equal(readlinkSync(join(options.target, 'alpha')), '/new');
  assert.deepEqual(JSON.parse(readFileSync(paths.manifest)), { user: 'modified' });
});

test('operation locks reject concurrent writes and preserve the owning lock', (t) => {
  const root = sandbox(t);
  const path = join(root, '.lock');
  withLock(path, () => {
    assert.throws(() => withLock(path, () => {}), /Another operation/);
    assert.equal(existsSync(path), true);
  });
  assert.equal(existsSync(path), false);
});

test('rollback refuses to restore a modified previous version', (t) => {
  const root = sandbox(t);
  const options = installOptions(root);
  install(installedFiles(), options);
  const oldSkill = join(readlinkSync(join(options.target, 'alpha')), 'SKILL.md');
  install(installedFiles(['alpha'], 'v2'), options);
  const current = readlinkSync(join(options.target, 'alpha'));
  chmodSync(oldSkill, 0o644);
  writeFileSync(oldSkill, 'modified previous version');
  assert.throws(() => rollback(options), /Previous installed version was modified/);
  assert.equal(readlinkSync(join(options.target, 'alpha')), current);
});

test('different state directories share a target lock for install, rollback, and recovery', (t) => {
  const root = sandbox(t);
  const options = installOptions(root);
  mkdirSync(options.target);
  const canonical = installPaths(options.target, options.stateRoot).target;
  withLock(join(canonical, '.pstack-t3-lock'), () => {
    const alternate = { ...options, stateRoot: join(root, 'other-state') };
    assert.throws(() => install(installedFiles(), alternate), /Another operation/);
    assert.throws(() => rollback(alternate), /Another operation/);
    assert.throws(() => recover(alternate), /Another operation/);
  });
  assert.equal(existsSync(join(options.target, 'alpha')), false);
});

test('state directory aliases cannot place state inside the skills target', (t) => {
  const root = sandbox(t);
  const options = installOptions(root);
  mkdirSync(options.target);
  const alias = join(root, 'state-alias');
  symlinkSync(options.target, alias);
  assert.throws(() => install(installedFiles(), { ...options, stateRoot: alias }), /separate directories/);
  assert.equal(existsSync(join(options.target, 'alpha')), false);
});

test('publication recovery restores the old tree and lock at each interrupted rename window', (t) => {
  for (const window of ['before-stage', 'backup-moved', 'new-moved', 'lock-written']) {
    const root = sandbox(t);
    const oldFiles = installedFiles();
    const newFiles = installedFiles(['alpha'], 'v2');
    const nextLock = { ...lock, commit: 'b'.repeat(40) };
    publish(root, oldFiles, lock);
    const record = { version: 1, beforeTree: treeId(oldFiles), afterTree: treeId(newFiles), lockBefore: Buffer.from(json(lock)).toString('base64'), lockAfter: Buffer.from(json(nextLock)).toString('base64') };
    atomicWrite(join(root, '.publication.json'), json(record));
    if (window !== 'before-stage') {
      writeTree(join(root, '.candidate'), newFiles);
      renameSync(join(root, 'generated'), join(root, '.previous-generated'));
    }
    if (['new-moved', 'lock-written'].includes(window)) renameSync(join(root, '.candidate'), join(root, 'generated'));
    if (window === 'lock-written') atomicWrite(join(root, 'upstream.lock.json'), json(nextLock));
    recoverPublication(root);
    assert.equal(treeId(readTree(join(root, 'generated'))), treeId(oldFiles), window);
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'upstream.lock.json'))), lock);
    assert.equal(existsSync(join(root, '.publication.json')), false);
  }
});

test('publication recovery preserves user edits and can finish committed cleanup', (t) => {
  const root = sandbox(t);
  const oldFiles = installedFiles();
  const newFiles = installedFiles(['alpha'], 'v2');
  const nextLock = { ...lock, commit: 'b'.repeat(40) };
  writeTree(join(root, 'generated'), newFiles);
  atomicWrite(join(root, 'upstream.lock.json'), json(nextLock));
  atomicWrite(join(root, '.publication.json'), json({ version: 1, beforeTree: treeId(oldFiles), afterTree: treeId(newFiles), lockBefore: Buffer.from(json(lock)).toString('base64'), lockAfter: Buffer.from(json(nextLock)).toString('base64') }));
  writeFileSync(join(root, 'generated', 'local-edit'), 'preserve');
  assert.throws(() => recoverPublication(root), /Generated tree changed/);
  assert.equal(readFileSync(join(root, 'generated', 'local-edit'), 'utf8'), 'preserve');
  rmSync(join(root, 'generated', 'local-edit'));
  assert.equal(recoverPublication(root).completed, true);
  assert.equal(treeId(readTree(join(root, 'generated'))), treeId(newFiles));
});

test('committed publication recovery preserves a partially deleted backup and finishes cleanup', (t) => {
  const root = sandbox(t);
  const oldFiles = installedFiles();
  const newFiles = installedFiles(['alpha'], 'v2');
  const nextLock = { ...lock, commit: 'b'.repeat(40) };
  writeTree(join(root, 'generated'), newFiles);
  writeTree(join(root, '.previous-generated'), oldFiles);
  rmSync(join(root, '.previous-generated', 'LICENSE'));
  atomicWrite(join(root, 'upstream.lock.json'), json(nextLock));
  atomicWrite(join(root, '.publication.json'), json({ version: 1, phase: 'committed', beforeTree: treeId(oldFiles), afterTree: treeId(newFiles), lockBefore: Buffer.from(json(lock)).toString('base64'), lockAfter: Buffer.from(json(nextLock)).toString('base64') }));
  assert.equal(recoverPublication(root).completed, true);
  assert.equal(treeId(readTree(join(root, 'generated'))), treeId(newFiles));
  assert.equal(existsSync(join(root, '.previous-generated')), false);
  assert.ok([...readTree(join(root, '.cache')).keys()].some((path) => path.startsWith('recovered-backup-') && path.endsWith('SKILL.md')));
});
