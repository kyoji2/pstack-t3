import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync, chmodSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const entry = (text, executable = false) => ({ bytes: Buffer.from(text), executable });

export function safePath(path) {
  if (!path || path.includes('\\') || path.includes('\0') || posix.isAbsolute(path) || path.split('/').some((part) => part === '..' || part === '.' || !part)) {
    throw new Error(`Unsafe relative path: ${path}`);
  }
  return path;
}

export function readTree(root) {
  const files = new Map();
  if (!existsSync(root)) return files;
  function visit(dir, prefix = '') {
    if (lstatSync(dir).isSymbolicLink()) throw new Error(`Symlink in tree: ${dir}`);
    for (const name of readdirSync(dir).sort()) {
      const path = prefix ? `${prefix}/${name}` : name;
      safePath(path);
      const full = join(root, path);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error(`Symlink in tree: ${full}`);
      if (stat.isDirectory()) visit(full, path);
      else if (stat.isFile()) files.set(path, { bytes: readFileSync(full), executable: (stat.mode & 0o111) !== 0 });
      else throw new Error(`Unsupported file: ${full}`);
    }
  }
  visit(root);
  return files;
}

export function treeId(files) {
  return hash(json([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, file]) => [path, hash(file.bytes), file.executable])));
}

export function diffTrees(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((path) => {
    const a = before.get(path);
    const b = after.get(path);
    if (a && b && a.bytes.equals(b.bytes) && a.executable === b.executable) return [];
    return [{ path, change: !a ? 'added' : !b ? 'removed' : 'modified' }];
  });
}

export function writeTree(root, files) {
  mkdirSync(root, { recursive: true });
  for (const [path, file] of files) {
    safePath(path);
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.bytes);
    chmodSync(target, file.executable ? 0o755 : 0o644);
  }
}

export function publish(root, files, lock) {
  const stage = join(root, '.candidate');
  const backup = join(root, '.previous-generated');
  const output = join(root, 'generated');
  const journalPath = join(root, '.publication.json');
  if (existsSync(stage) || existsSync(backup) || existsSync(journalPath)) throw new Error('Unfinished publication found. Run recover --publication.');
  const lockPath = join(root, 'upstream.lock.json');
  const oldLock = existsSync(lockPath) ? readFileSync(lockPath) : null;
  const record = {
    version: 1,
    phase: 'preparing',
    beforeTree: existsSync(output) ? treeId(readTree(output)) : null,
    afterTree: treeId(files),
    lockBefore: oldLock?.toString('base64') ?? null,
    lockAfter: lock ? Buffer.from(json(lock)).toString('base64') : oldLock?.toString('base64') ?? null,
  };
  atomicWrite(journalPath, json(record));
  try {
    writeTree(stage, files);
    if (existsSync(output)) renameSync(output, backup);
    renameSync(stage, output);
    if (lock) atomicWrite(lockPath, json(lock));
    atomicWrite(journalPath, json({ ...record, phase: 'committed' }));
  } catch (error) {
    recoverPublication(root);
    throw error;
  }
  rmSync(backup, { recursive: true, force: true });
  rmSync(journalPath);
}

export function recoverPublication(root) {
  const journalPath = join(root, '.publication.json');
  if (!existsSync(journalPath)) throw new Error('No publication journal found. Inspect any staging directories before removing them.');
  const record = readJson(journalPath);
  if (record.version !== 1 || !/^[a-f0-9]{64}$/.test(record.afterTree) || (record.beforeTree !== null && !/^[a-f0-9]{64}$/.test(record.beforeTree))) throw new Error('Invalid publication journal.');
  for (const value of [record.lockBefore, record.lockAfter]) {
    if (value !== null && (typeof value !== 'string' || Buffer.from(value, 'base64').toString('base64') !== value)) throw new Error('Invalid source lock in publication journal.');
  }
  const stage = join(root, '.candidate');
  const backup = join(root, '.previous-generated');
  const output = join(root, 'generated');
  const lockPath = join(root, 'upstream.lock.json');
  const currentLock = existsSync(lockPath) ? readFileSync(lockPath).toString('base64') : null;
  if (currentLock !== record.lockBefore && currentLock !== record.lockAfter) throw new Error('Source lock changed after interruption. No files were restored.');
  const outputId = existsSync(output) ? treeId(readTree(output)) : null;
  if (record.phase === 'committed' && outputId === record.afterTree && currentLock === record.lockAfter && !existsSync(stage)) {
    if (existsSync(backup)) {
      const saved = join(root, '.cache', `recovered-backup-${process.pid}-${Date.now()}`);
      mkdirSync(dirname(saved), { recursive: true });
      renameSync(backup, saved);
    }
    rmSync(journalPath);
    return { publicationRecovered: true, completed: true };
  }
  const backupId = existsSync(backup) ? treeId(readTree(backup)) : null;
  if (backupId !== null && backupId !== record.beforeTree) throw new Error('Publication backup changed. No files were restored.');
  if (outputId !== null && outputId !== record.beforeTree && outputId !== record.afterTree) throw new Error('Generated tree changed after interruption. No files were restored.');
  if (record.beforeTree !== null && backupId === null && outputId !== record.beforeTree) {
    if (outputId === record.afterTree && currentLock === record.lockAfter && !existsSync(stage)) {
      rmSync(journalPath);
      return { publicationRecovered: true, completed: true };
    }
    throw new Error('Previous generated tree is unavailable. Inspect the publication journal before continuing.');
  }
  if (existsSync(stage)) {
    readTree(stage);
    const saved = join(root, '.cache', `recovered-candidate-${process.pid}-${Date.now()}`);
    mkdirSync(dirname(saved), { recursive: true });
    renameSync(stage, saved);
  }
  if (backupId !== null) {
    rmSync(output, { recursive: true, force: true });
    renameSync(backup, output);
  } else if (record.beforeTree === null) {
    rmSync(output, { recursive: true, force: true });
  }
  if (record.lockBefore === null) rmSync(lockPath, { force: true });
  else atomicWrite(lockPath, Buffer.from(record.lockBefore, 'base64'));
  rmSync(journalPath);
  return { publicationRecovered: true, completed: false };
}

export function atomicWrite(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  let created = false;
  try {
    writeFileSync(temp, bytes, { flag: 'wx' });
    created = true;
    renameSync(temp, path);
  }
  finally { if (created) rmSync(temp, { force: true }); }
}

export function withLock(path, action) {
  mkdirSync(dirname(path), { recursive: true });
  try { mkdirSync(path); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another operation or an interrupted run owns ${path}. Inspect it before removing it.`);
    throw error;
  }
  try {
    writeFileSync(join(path, 'owner.json'), json({ pid: process.pid, startedAt: new Date().toISOString() }));
    return action();
  }
  finally { rmSync(path, { recursive: true, force: true }); }
}
