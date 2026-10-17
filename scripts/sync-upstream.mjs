import { join } from 'node:path';
import { atomicWrite, json, publish, readJson } from './files.mjs';
import { loadAdapter, render, updateReport } from './generate-t3-tree.mjs';
import { fetchSource, loadSource } from './source.mjs';

export function applyCandidate(root, before, after, candidate, adapter = loadAdapter(root)) {
  const oldLock = readJson(join(root, 'upstream.lock.json'));
  const report = updateReport(before, after, oldLock, candidate, adapter);
  let files;
  try { files = render(after, candidate, adapter); }
  catch (error) {
    report.validation = { passed: false, error: error.message };
    atomicWrite(join(root, '.cache', 'update-report.json'), json(report));
    throw new Error(`${error.message}\nCandidate report: ${join(root, '.cache', 'update-report.json')}\nThe lock and generated tree were not changed.`);
  }
  report.validation = { passed: true };
  atomicWrite(join(root, '.cache', 'update-report.json'), json(report));
  publish(root, files, candidate);
  return report;
}

export function update(root, ref) {
  const lock = readJson(join(root, 'upstream.lock.json'));
  const before = loadSource(root, lock);
  const commit = fetchSource(root, ref);
  const candidate = { ...lock, commit };
  return applyCandidate(root, before, loadSource(root, candidate), candidate);
}
