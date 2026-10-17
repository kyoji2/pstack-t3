import { existsSync, lstatSync, mkdirSync, readlinkSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { atomicWrite, hash, json, readJson, readTree, treeId, withLock, writeTree } from './files.mjs';

function linkAt(path) {
  let stat;
  try { stat = lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!stat.isSymbolicLink()) throw new Error(`Unmanaged file or directory at ${path}`);
  return readlinkSync(path);
}

function canonicalDirectory(path) {
  let ancestor = resolve(path);
  const missing = [];
  while (!existsSync(ancestor)) {
    missing.unshift(basename(ancestor));
    ancestor = dirname(ancestor);
  }
  return join(realpathSync(ancestor), ...missing);
}

export function installPaths(target, stateRoot) {
  const actual = canonicalDirectory(target || join(homedir(), '.agents', 'skills'));
  const stateBase = canonicalDirectory(stateRoot || join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'pstack-t3'));
  const state = join(stateBase, hash(actual).slice(0, 24));
  if (state === actual || state.startsWith(`${actual}/`) || actual.startsWith(`${state}/`)) throw new Error('Skills target and installation state must be separate directories.');
  return { target: actual, state, manifest: join(state, 'installation.json'), journal: join(state, 'transaction.json') };
}

function withInstallationLock(paths, action) {
  mkdirSync(paths.target, { recursive: true });
  return withLock(join(paths.target, '.pstack-t3-lock'), () => withLock(join(paths.state, '.lock'), action));
}

function validateLinks(links) {
  if (!links || typeof links !== 'object' || Array.isArray(links)) throw new Error('Invalid installation link map.');
  for (const [name, value] of Object.entries(links)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || (value !== null && typeof value !== 'string')) throw new Error('Invalid installation link record.');
  }
}

function readState(paths) {
  if (existsSync(paths.journal)) throw new Error(`Interrupted installation found at ${paths.journal}. Run recover with the same target and state directory.`);
  if (!existsSync(paths.manifest)) return { version: 1, target: paths.target, managed: {}, installed: null, history: [] };
  const state = readJson(paths.manifest);
  if (state.version !== 1 || state.target !== paths.target || !Array.isArray(state.history)) throw new Error('Invalid installation manifest.');
  validateLinks(state.managed);
  return state;
}

function checkSnapshot(target, snapshot) {
  validateLinks(snapshot);
  for (const [name, expected] of Object.entries(snapshot)) {
    const actual = linkAt(join(target, name));
    if (actual !== expected) throw new Error(`Changed path: ${join(target, name)}. Expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}. No links were changed.`);
  }
}

function setLink(path, value) {
  if (value === null) { rmSync(path, { force: true }); return; }
  const temp = `${path}.pstack-t3-${process.pid}`;
  try {
    lstatSync(temp);
    throw new Error(`Unexpected temporary link: ${temp}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { symlinkSync(value, temp, 'dir'); renameSync(temp, path); }
  finally { rmSync(temp, { force: true }); }
}

function apply(paths, before, after, next) {
  checkSnapshot(paths.target, before);
  const manifestBefore = existsSync(paths.manifest) ? readJson(paths.manifest) : null;
  atomicWrite(paths.journal, json({ version: 1, target: paths.target, before, after, manifestBefore, manifestAfter: next }));
  const changed = [];
  try {
    for (const [name, value] of Object.entries(after)) {
      if (before[name] === value) continue;
      if (linkAt(join(paths.target, name)) !== before[name]) throw new Error(`Path changed during installation: ${name}`);
      setLink(join(paths.target, name), value);
      changed.push(name);
    }
    atomicWrite(paths.manifest, json(next));
  } catch (error) {
    for (const name of changed.reverse()) {
      const path = join(paths.target, name);
      if (linkAt(path) !== after[name]) throw new Error(`Cannot restore changed path ${path}. Keep ${paths.journal} for recovery. Original error: ${error.message}`);
      setLink(path, before[name]);
    }
    if (manifestBefore) atomicWrite(paths.manifest, json(manifestBefore));
    else rmSync(paths.manifest, { force: true });
    rmSync(paths.journal, { force: true });
    throw error;
  }
  rmSync(paths.journal, { force: true });
}

function versionDirectory(paths, files) {
  const id = treeId(files);
  const version = join(paths.state, 'versions', id);
  if (existsSync(version)) {
    if (treeId(readTree(version)) !== id) throw new Error(`Installed version was modified: ${version}`);
    return { id, version };
  }
  const stage = `${version}.tmp-${process.pid}`;
  if (existsSync(stage)) throw new Error(`Unfinished version directory: ${stage}`);
  try {
    writeTree(stage, files);
    for (const [path, file] of files) chmodSync(join(stage, path), file.executable ? 0o555 : 0o444);
    mkdirSync(dirname(version), { recursive: true });
    renameSync(stage, version);
  } finally { rmSync(stage, { recursive: true, force: true }); }
  return { id, version };
}

export function install(files, options = {}) {
  const paths = installPaths(options.target, options.stateRoot);
  return withInstallationLock(paths, () => {
    const state = readState(paths);
    checkSnapshot(paths.target, state.managed);
    const names = [...files.keys()].filter((path) => /^skills\/[^/]+\/SKILL\.md$/.test(path)).map((path) => path.split('/')[1]);
    if (!names.length) throw new Error('No skills to install.');
    const migrated = {};
    if (options.migrateFrom) {
      const legacy = realpathSync(resolve(options.migrateFrom));
      for (const name of readdirSync(paths.target)) {
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) continue;
        const path = join(paths.target, name);
        if (!lstatSync(path).isSymbolicLink()) continue;
        const raw = readlinkSync(path);
        let actual;
        try { actual = realpathSync(path); } catch { continue; }
        const expected = join(legacy, 'skills', name);
        if (existsSync(join(expected, 'SKILL.md')) && actual === realpathSync(expected)) migrated[name] = raw;
      }
    }
    const affected = [...new Set([...Object.keys(state.managed), ...names, ...Object.keys(migrated)])].sort();
    const before = {};
    for (const name of affected) {
      const current = linkAt(join(paths.target, name));
      if (current !== null && !Object.hasOwn(state.managed, name) && !Object.hasOwn(migrated, name)) {
        throw new Error(`Unmanaged link at ${join(paths.target, name)}. Use explicit --migrate-from only for the installation that owns it.`);
      }
      before[name] = current;
    }
    const { id, version } = versionDirectory(paths, files);
    const managed = Object.fromEntries(names.sort().map((name) => [name, join(version, 'skills', name)]));
    const after = Object.fromEntries(affected.map((name) => [name, managed[name] || null]));
    checkSnapshot(paths.target, before);
    if (JSON.stringify(before) === JSON.stringify(after)) return { version: id, skills: names.length, unchanged: true };
    const next = {
      version: 1, target: paths.target, managed, installed: id,
      history: [...state.history, { before, after, managedBefore: state.managed, installedBefore: state.installed }],
    };
    apply(paths, before, after, next);
    return { version: id, skills: names.length, migrated: Object.keys(migrated).length };
  });
}

export function rollback(options = {}) {
  const paths = installPaths(options.target, options.stateRoot);
  return withInstallationLock(paths, () => {
    const state = readState(paths);
    const previous = state.history.at(-1);
    if (!previous) throw new Error('No installation to roll back.');
    validateLinks(previous.before); validateLinks(previous.after); validateLinks(previous.managedBefore);
    if (previous.installedBefore) {
      if (!/^[a-f0-9]{64}$/.test(previous.installedBefore) || treeId(readTree(join(paths.state, 'versions', previous.installedBefore))) !== previous.installedBefore) {
        throw new Error('Previous installed version was modified. No links were changed.');
      }
    }
    const next = { ...state, managed: previous.managedBefore, installed: previous.installedBefore, history: state.history.slice(0, -1) };
    apply(paths, previous.after, previous.before, next);
    return { version: next.installed, restored: Object.keys(previous.before).length };
  });
}

export function installationStatus(options = {}) {
  const paths = installPaths(options.target, options.stateRoot);
  const state = readState(paths);
  checkSnapshot(paths.target, state.managed);
  if (state.installed) {
    if (!/^[a-f0-9]{64}$/.test(state.installed)) throw new Error('Invalid installed version ID.');
    const dir = join(paths.state, 'versions', state.installed);
    if (treeId(readTree(dir)) !== state.installed) throw new Error(`Installed version was modified: ${dir}`);
  }
  return { target: paths.target, version: state.installed, skills: Object.keys(state.managed).length, rollbackAvailable: state.history.length > 0 };
}

export function recover(options = {}) {
  const paths = installPaths(options.target, options.stateRoot);
  return withInstallationLock(paths, () => {
    if (!existsSync(paths.journal)) throw new Error('No interrupted transaction to recover.');
    const journal = readJson(paths.journal);
    if (journal.version !== 1 || journal.target !== paths.target) throw new Error('Invalid recovery journal.');
    validateLinks(journal.before); validateLinks(journal.after);
    const currentManifest = existsSync(paths.manifest) ? readJson(paths.manifest) : null;
    if (json(currentManifest) !== json(journal.manifestBefore) && json(currentManifest) !== json(journal.manifestAfter ?? null)) {
      throw new Error('Installation manifest changed after interruption. No links were changed.');
    }
    if (Object.keys(journal.before).sort().join('\0') !== Object.keys(journal.after).sort().join('\0')) throw new Error('Recovery journal path sets differ.');
    for (const name of Object.keys(journal.before)) {
      const value = linkAt(join(paths.target, name));
      if (value !== journal.before[name] && value !== journal.after[name]) throw new Error(`Recovery found a changed path: ${name}. No links were changed.`);
    }
    for (const [name, value] of Object.entries(journal.before)) {
      const path = join(paths.target, name);
      const current = linkAt(path);
      if (current !== value && current !== journal.after[name]) throw new Error(`Path changed during recovery: ${path}`);
      setLink(path, value);
    }
    if (journal.manifestBefore) atomicWrite(paths.manifest, json(journal.manifestBefore));
    else rmSync(paths.manifest, { force: true });
    rmSync(paths.journal, { force: true });
    return { recovered: true };
  });
}
