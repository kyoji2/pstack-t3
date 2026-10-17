#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffTrees, json, publish, readJson, readTree, recoverPublication, withLock } from '../scripts/files.mjs';
import { loadAdapter, render, updateReport } from '../scripts/generate-t3-tree.mjs';
import { fetchSource, loadSource } from '../scripts/source.mjs';
import { install, installationStatus, recover, rollback } from '../scripts/install.mjs';
import { update } from '../scripts/sync-upstream.mjs';

const root = dirname(dirname(realpathSync(fileURLToPath(import.meta.url))));
const [command = 'help', ...args] = process.argv.slice(2);
const allowed = {
  help: [], fetch: [], generate: ['check'], update: ['ref'],
  status: ['online', 'ref', 'target', 'state-dir'],
  install: ['target', 'state-dir'],
  rollback: ['target', 'state-dir'], recover: ['publication', 'target', 'state-dir'],
};

function options() {
  if (!Object.hasOwn(allowed, command)) throw new Error(`Unknown command: ${command}`);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || !allowed[command].includes(key) || Object.hasOwn(parsed, key)) throw new Error(`Unexpected argument: ${args[i]}`);
    if (['check', 'online', 'publication'].includes(key)) parsed[key] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for --${key}`);
      parsed[key] = args[++i];
    }
  }
  return parsed;
}

try {
  const opts = options();
  const installation = { target: opts.target, stateRoot: opts['state-dir'] };
  const locked = () => readJson(join(root, 'upstream.lock.json'));
  const expected = () => render(loadSource(root, locked()), locked(), loadAdapter(root));
  const mutation = (action) => withLock(join(root, '.cache', '.operation-lock'), action);
  let result;
  switch (command) {
    case 'help':
      result = 'sync-pstack-t3 fetch\nsync-pstack-t3 generate [--check]\nsync-pstack-t3 update [--ref main]\nsync-pstack-t3 status [--online] [--ref main] [--target DIR] [--state-dir DIR]\nsync-pstack-t3 install [--target DIR] [--state-dir DIR]\nsync-pstack-t3 rollback [--target DIR] [--state-dir DIR]\nsync-pstack-t3 recover [--publication | --target DIR --state-dir DIR]';
      break;
    case 'fetch':
      result = mutation(() => {
        const lock = locked();
        const commit = fetchSource(root, lock.commit);
        if (commit !== lock.commit) throw new Error('Fetched commit differs from the lock.');
        loadSource(root, lock);
        return { cached: commit };
      });
      break;
    case 'generate': {
      const action = () => {
        const files = expected();
        if (opts.check) {
          const drift = diffTrees(files, readTree(join(root, 'generated')));
          if (drift.length) throw new Error(`Generated tree is out of date:\n${drift.map(({ path }) => path).join('\n')}\nRun sync-pstack-t3 generate.`);
          return { current: true, files: files.size };
        }
        publish(root, files);
        return { generated: files.size };
      };
      result = opts.check ? action() : mutation(action);
      break;
    }
    case 'update':
      result = mutation(() => update(root, opts.ref || 'main'));
      break;
    case 'status': {
      const lock = locked();
      result = { locked: lock.commit, installation: installationStatus(installation) };
      if (opts.online) {
        result.upstream = mutation(() => {
          const before = loadSource(root, lock);
          const candidate = { ...lock, commit: fetchSource(root, opts.ref || 'main') };
          return updateReport(before, loadSource(root, candidate), lock, candidate, loadAdapter(root));
        });
      }
      break;
    }
    case 'install':
      result = mutation(() => {
        const files = expected();
        const drift = diffTrees(files, readTree(join(root, 'generated')));
        if (drift.length) throw new Error('Generated tree differs from validated inputs. Run generate --check before installing.');
        return install(files, installation);
      });
      break;
    case 'rollback': result = rollback(installation); break;
    case 'recover':
      if (opts.publication && (opts.target || opts['state-dir'])) throw new Error('--publication cannot be combined with installation options.');
      result = opts.publication ? mutation(() => recoverPublication(root)) : recover(installation);
      break;
  }
  process.stdout.write(typeof result === 'string' ? `${result}\n` : json(result));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
