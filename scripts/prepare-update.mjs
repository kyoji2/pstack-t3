import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite, json, readJson, withLock } from './files.mjs';
import { loadAdapter, updateReport } from './generate-t3-tree.mjs';
import { fetchSource, loadSource } from './source.mjs';
import { applyCandidate } from './sync-upstream.mjs';

export function prepareCandidate(root, before, after, candidate, adapter = loadAdapter(root)) {
  const lock = readJson(join(root, 'upstream.lock.json'));
  const report = updateReport(before, after, lock, candidate, adapter);
  if (!report.changes.length) {
    report.validation = { passed: true };
    report.changed = false;
    atomicWrite(join(root, '.cache', 'update-report.json'), json(report));
    return report;
  }
  return { ...applyCandidate(root, before, after, candidate, adapter), changed: true };
}

export function formatReport(report) {
  const literal = (text) => `\`${String(text).replace(/[\r\n`<>]/g, ' ')}\``;
  const lines = [
    '# Upstream pstack update', '',
    `Source commit: ${literal(report.from)}.`, '',
    `Checked commit: ${literal(report.to)}.`, '',
  ];
  if (report.validation?.passed === false) {
    lines.push('Generation requires review. The source lock and generated tree remain unchanged.', '', 'Diagnostic:', '', ...report.validation.error.split('\n').map((line) => `> ${line.replace(/[<>]/g, '')}`), '');
  } else if (!report.changed) {
    lines.push('No relevant upstream files changed. No pull request is needed.', '');
  } else {
    lines.push('Regenerated the T3 skill tree from the checked upstream commit. Installation remains a separate action.', '');
  }
  if (report.changes.length) {
    lines.push('Changed upstream files:', '');
    for (const change of report.changes.slice(0, 100)) {
      lines.push(`- ${change.change}: ${literal(change.path)}${change.highImpact ? ' (review platform behavior)' : ''}${change.override ? ' (local replacement)' : ''}.`);
    }
    if (report.changes.length > 100) lines.push(`- ${report.changes.length - 100} additional files appear in the JSON report.`);
    lines.push('');
  }
  if (report.newRequirements.length) lines.push(`New detected requirements: ${report.newRequirements.map(literal).join(', ')}.`, '');
  if (JSON.stringify(report.roles.before) !== JSON.stringify(report.roles.after)) {
    lines.push('Model roles changed. Compare the before and after lists in the JSON report.', '');
  }
  lines.push('The Actions run retains the complete JSON report and this summary as artifacts.', '');
  return lines.join('\n');
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  let report;
  let failed;
  try {
    report = withLock(join(root, '.cache', '.operation-lock'), () => {
      const lock = readJson(join(root, 'upstream.lock.json'));
      fetchSource(root, lock.commit);
      const before = loadSource(root, lock);
      const candidate = { ...lock, commit: fetchSource(root, 'main') };
      const after = loadSource(root, candidate);
      try { return prepareCandidate(root, before, after, candidate); }
      catch (error) {
        report = readJson(join(root, '.cache', 'update-report.json'));
        throw error;
      }
    });
  } catch (error) { failed = error; }
  if (report) {
    const markdown = formatReport(report);
    atomicWrite(join(root, '.cache', 'update-report.json'), json(report));
    atomicWrite(join(root, '.cache', 'update-report.md'), markdown);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    process.stdout.write(markdown);
  } else if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '# Upstream check failed\n\nThe source could not be checked. See the step log for the error.\n');
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${!failed && report?.changed === true}\n`);
  if (failed) { process.stderr.write(`${failed.message}\n`); process.exitCode = 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
