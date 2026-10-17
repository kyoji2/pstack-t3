# Install and update pstack-t3

## Install the locked version

Use Node.js 22 or later and Git. Clone the repository, fetch its locked upstream source, and validate the generated tree:

```sh
git clone https://github.com/kyoji2/pstack-t3.git
cd pstack-t3
node bin/sync-pstack-t3.mjs fetch
node bin/sync-pstack-t3.mjs generate --check
node bin/sync-pstack-t3.mjs install
```

The default target is `~/.agents/skills`. Restart the agent session if its skill list does not refresh. Invoke `poteto-mode` through the host's skill interface, or ask the agent to read the installed `poteto-mode/SKILL.md`.

Run `setup-pstack` to choose models. A role without configuration inherits the parent for single-model work. Workflows that require different models need an explicit valid panel configuration.

The CLI runs from any working directory when invoked by its absolute path. It uses the repository containing the executable. There is no npm dependency installation step.

## Replace a p3-stack installation

Pass the old checkout explicitly:

```sh
node bin/sync-pstack-t3.mjs install --migrate-from /path/to/p3-stack
```

The installer replaces only links whose resolved targets match skills in that checkout. It retains unrelated skills and the old checkout. If a generated skill name conflicts with an unmanaged path, installation stops before changing links.

The aliases `p3-mode`, `p3-help`, and `setup-p3` read the new canonical skills. No model configuration is imported.

## Test a separate target

Use separate target and state directories:

```sh
node bin/sync-pstack-t3.mjs install --target /tmp/pstack-t3-skills --state-dir /tmp/pstack-t3-state
node bin/sync-pstack-t3.mjs status --target /tmp/pstack-t3-skills --state-dir /tmp/pstack-t3-state
node bin/sync-pstack-t3.mjs rollback --target /tmp/pstack-t3-skills --state-dir /tmp/pstack-t3-state
```

Use the same options for later commands on that installation.

## Check upstream changes

Inspect the locked version and installed state:

```sh
node bin/sync-pstack-t3.mjs status
```

Add `--online` to fetch the latest `main` and compare relevant upstream files. A network failure exits with an error. An offline status does not claim that upstream is current.

```sh
node bin/sync-pstack-t3.mjs status --online
```

## Prepare an update

Update the lock and generated tree:

```sh
node bin/sync-pstack-t3.mjs update --ref main
```

The command prints a JSON report and saves it to `.cache/update-report.json`. Review the source changes and generated diff before installing. The current installation stays on its fixed version directory.

If validation rejects a candidate, inspect the report. The previous lock and generated tree remain in place. The report's `to` field identifies the candidate commit.

For a file that requires review, read its candidate bytes from the cache:

```sh
git --git-dir .cache/upstream.git show CANDIDATE_COMMIT:pstack/skills/setup-pstack/SKILL.md
```

Compare the file with its version at the locked commit. Update the adapter or replacement as needed. After review, replace that file's SHA-256 hash in `adapter/rules.json`. The `reviewedSources` map tracks the upstream generator and Claude Code adapter. The `overrides` map tracks replaced files. Hash the exact Git blob bytes, including line endings.

Retry the update at the reviewed commit, so a later change to `main` does not enter the candidate:

```sh
node bin/sync-pstack-t3.mjs update --ref CANDIDATE_COMMIT
npm test
npm run check
git diff
```

Commit the source lock, adaptation changes, and generated tree together. Install the reviewed result with `install`.

## Roll back an installation

Restore the previous links:

```sh
node bin/sync-pstack-t3.mjs rollback
```

Rollback checks every affected path before changing links. If a path no longer matches the recorded installation, resolve that conflict first. Rollback does not overwrite a local replacement. Version directories remain available for inspection.

The default state directory is `$XDG_STATE_HOME/pstack-t3`, or `~/.local/state/pstack-t3` when that variable is unset. Each target has a separate state directory beneath it.

## Recover an interrupted operation

An interrupted install can leave `transaction.json` in its target's state directory and locks at `<target>/.pstack-t3-lock` and `<state>/.lock`. Each lock contains an `owner.json` with the process ID and start time. Confirm that the operation is no longer running before removing either lock directory. Preserve `transaction.json`, then run recovery with the same target and state options:

```sh
node bin/sync-pstack-t3.mjs recover
```

Recovery restores the links and manifest from before the interrupted transaction. If a link has an unrelated value, recovery stops before changing links.

Generation and updates use a repository operation lock at `.cache/.operation-lock`. After confirming that its owner is no longer running, remove that lock directory and recover an interrupted publication:

```sh
node bin/sync-pstack-t3.mjs recover --publication
```

Recovery checks `.publication.json`, the generated tree, the backup, and the source lock. It restores the previous tree and lock unless the update already committed and only journal cleanup remains. Partial candidates move into `.cache/recovered-candidate-*` for inspection. Remaining backups from committed publications move into `.cache/recovered-backup-*`. If the tree or lock has an unrelated change, recovery stops without overwriting it.

If staging directories exist without a publication journal, inspect them before restoring or removing them. The CLI refuses to guess their origin.
