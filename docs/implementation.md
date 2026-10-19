# Implementation specification

This document specifies the generator, update workflow, and managed installation. See [Install and update pstack-t3](usage.md) for commands.

## Repository layout

The main project files separate source tracking, adaptation, generation, and installation.

```text
upstream.lock.json
adapter/
	SKILL.md
	rules.json
overrides/
	skills/
		setup-pstack/SKILL.md
		make-bot-ui/SKILL.md
bin/
	sync-pstack-t3.mjs
scripts/
	files.mjs
	source.mjs
	sync-upstream.mjs
	generate-t3-tree.mjs
	install.mjs
generated/
	skills/
		pstack-t3-adapter/
			SKILL.md
			agents/
	LICENSE
	provenance.json
tests/
```

The initial implementation uses Node.js built-in modules. The project has no dependency on a dotfiles checkout or a machine-specific directory.

## Source tracking

`upstream.lock.json` records the official repository URL, resolved commit, and source directory. The source repository is `https://github.com/cursor/plugins`. The source directory is `pstack/`.

The local source cache is ignored by Git. Once the locked source is cached, generation works offline. Synchronization and generation treat upstream scripts as data and do not execute them. Source symlinks and paths outside the source root are errors.

## Generation

The generator builds a candidate tree in a staging directory. The published tree changes only after validation passes.

The generator has the following requirements:

- Discover every skill directory that contains `SKILL.md` and copy its complete contents.
- Copy upstream agent documents into the adapter skill's `agents/` directory and copy the upstream license.
- Generate the adapter as the sibling skill `pstack-t3-adapter`. The installer links skills only, and a skill finds a sibling at `../<name>/SKILL.md` from the path the host reports. A path through `docs/` or a parent directory would resolve through the symlink and fail, so every file a skill reads lives inside a linked skill directory.
- Preserve executable permissions on copied files.
- Scan Markdown files, including playbooks and references, for platform-specific concepts.
- Add a T3 adapter instruction to every skill entry point. Preserve its frontmatter except for normalizing a display name to its matching directory slug. Record the original name in provenance. Repeated generation adds the instruction once.
- Apply declared replacement files after validating their reviewed upstream hashes. A changed upstream file blocks its replacement until review updates the recorded hash.
- Keep relative links when their targets exist in the generated tree. Convert links to omitted upstream documents into GitHub URLs at the locked commit.
- Validate local file targets, directory targets, and source-root boundaries. Preserve query strings and fragments. Remote targets and heading anchors are not fetched or checked. Report unresolved local targets except declared template placeholders in `adapter/rules.json`.
- Produce the same bytes and executable permissions for the same inputs.

`provenance.json` records the upstream commit, generator format version, adapter hashes, replacement hashes, and each file's origin. It excludes timestamps, absolute paths, and machine details.

The initial output is a skill directory tree. It has no Claude Code plugin manifests and makes no claim to implement a T3 plugin format.

## T3 adapter behavior

The adapter defines the following mappings:

| Upstream concept | T3 behavior |
| --- | --- |
| `Task` | Select an available delegation tool. Use `delegate_task` for T3-owned children and for models that native tools do not support. |
| Model selection | Resolve provider instances, model IDs, and supported options through `orchestrator_capabilities`. Cursor model slugs are not T3 model IDs. |
| Background work | Prefer async delegation and completion notifications. Read status when a result is needed during the active turn. |
| Agent types | Include the absolute path of the agent document under `pstack-t3-adapter/agents/` and a requirement to read it in the child brief. |
| Read-only work | Prohibit edits in the brief and verify the resulting state. Runtime permission modes do not provide a read-only switch. |
| Cloud workers | Use `delegate_task` with `isolation: "worktree"` for an isolated child. The child starts from the parent's local commit. It does not receive uncommitted edits. |
| `cloud_base_branch` | Resolve the requested baseline explicitly. Report a baseline that the chosen delegation API cannot express. |
| Top-level conversations | Use `t3_thread_launch` when the user requests a separate top-level conversation. The launch request binds its workspace. |
| Independent review rounds | Create a new task with the original brief, previous findings, responses, and unresolved objections. Each round has a distinct request ID. |
| Stateful follow-ups | Reuse a child conversation only when the follow-up requires its existing state and the current tool contract permits reuse. |
| Detecting T3 Code | Session instructions or a callable `delegate_task` or `orchestrator_capabilities` mean T3. The host name does not decide it. Without T3, `Task` maps to the host's subagents or to work in the current session, and the report says independent review did not happen. |
| `deslop` | Run as a checklist over the diff in the current session. Do not search for the Cursor plugin. |
| Unreadable adapter | Stop and tell the user. |
| PR watching | Use `watch_pull_request` and its notification lifecycle. |
| Recurring work | Use `schedule_task` with a structured schedule when the user requests persistent recurring work. A single autonomous run does not imply a recurring schedule. |
| Transcript inspection | Use `t3_thread_search` and `t3_thread_read` within the relevant project. |
| Skill routing | Read the generated target `SKILL.md` when the host cannot invoke the skill through a tool. |
| Browser and device evidence | Use the host's available tools, including T3 preview and device tools when exposed. Report missing capabilities. |

## Skill names

Skill names match upstream. The generator creates one entry point for each upstream skill directory.

## Model configuration

The replacement `setup-pstack` reads `orchestrator_capabilities` and writes `pstack-models.md`. A project file takes precedence over `~/.agents/pstack-models.md`. Skills read the file explicitly.

Configured provider IDs, model IDs, and options must match the live catalog. An omitted target inherits the parent where the tool supports inheritance. Explicit panel sizes and model diversity remain part of the requested configuration. Unavailable choices produce a diagnostic rather than silently reducing a panel to one model.

Changes to upstream roles appear in the update report. User model files remain outside this repository.

## Command interface

The `sync-pstack-t3` executable lives in `bin/sync-pstack-t3.mjs`.

| Command | Result |
| --- | --- |
| `fetch` | Cache the exact locked upstream commit without changing the lock or generated tree. |
| `generate` | Generate the tree from the cached locked source. |
| `status` | Report the locked and installed versions. With `--online`, fetch a reference and report relevant source changes. Distinguish network failures from an unchanged source. |
| `update --ref main` | Resolve the reference, compare sources, generate a candidate tree, and report changes. Publish the lock and tree after validation passes. Leave the installed version unchanged. |
| `generate --check` | Compare expected output with the generated tree, including stale files and executable permissions. Write no files. |
| `install` | Install a validated version and record the managed links and previous targets. |
| `rollback` | Restore the previous installation after checking for changes to managed paths. |
| `recover` | Restore the links and manifest from an interrupted installation journal after checking for unrelated changes. |

A failed validation leaves the previous lock and generated tree usable. Publication rolls back ordinary I/O failures. A process interruption leaves a publication journal that `recover --publication` uses to restore the previous tree and lock, or finish cleanup of a committed update. The [recovery procedure](usage.md#recover-an-interrupted-operation) describes both repository and installation recovery.

## Update report

The report includes the following changes:

- Added, removed, and modified skills, playbooks, references, and scripts.
- Changes to detection rules in the upstream generator and to the upstream adapter document.
- New platform terms and changed model roles.
- Changes to designated documents about delegation, isolation, models, scheduling, watching, and installation.
- Changed upstream files whose local replacements require review.

A detected requirement without an adapter mapping blocks generation. The detector cannot identify every new requirement in prose, so source changes still need review.

## Installation state

The initial default target is `~/.agents/skills`. The installer also accepts an explicit target directory. Support for other hosts requires a discovery test.

The installation manifest lives outside the generated tree and tracked repository files. It records the installed version, managed link paths, and previous targets. The installer resolves existing directory aliases before checking that the target and state directory are separate.

The installer has the following requirements:

- Install from an immutable local version directory.
- Preserve the complete tree because skills refer to sibling skills, agent documents, and the adapter.
- Validate all destination conflicts before changing links. Install, rollback, and recovery share a lock in the canonical target directory, independent of `--state-dir`.
- Refuse to overwrite unmanaged files, directories, or links.
- Remove a retired link only when it still matches a previously managed link.
- Preserve the state needed to restore the previous version.
- Report changed paths before rollback and preserve those paths.

Installation and rollback preserve unrelated skills.

## Acceptance criteria

Automated tests cover the following behavior:

1. Identical locked inputs produce identical output. `generate --check` detects content, file-set, and permission changes without writes.
2. The tree includes all skills and required references. Adapter injection preserves frontmatter fields except the documented name normalization and retains executable permissions.
3. Links to omitted documents use the locked commit. Invalid source paths and paths outside the source root fail validation.
4. New detected platform requirements and changed replacement baselines produce actionable errors.
5. Failed updates preserve the previous lock and generated tree.
6. Installation refuses unmanaged collisions and removes only retired managed links. Rollback restores the previous installation without overwriting changed paths.
7. The setup skill checks model targets and option values against the live catalog. Tests verify its role list against upstream. Model choices and tool execution require runtime observation.

Runtime validation uses a temporary installation before the real installation changes. Representative runs cover model selection, a child in an isolated worktree, a fresh review round, skill routing, and PR-watch handling.

Static file checks and runtime observations are separate evidence. Successful generation does not prove that an agent follows the adapter.

## Delivery order

Implementation proceeds in this order:

1. Source locking, deterministic generation, the adapter, and update reports.
2. The workflow replacements, including source-change checks.
3. Automated tests and representative T3 runs.
4. Managed installation and rollback.
5. Update of the real local installation.

## Daily automation

`.github/workflows/update-upstream.yml` runs at 01:23 UTC each day and accepts manual dispatch. `scripts/prepare-update.mjs` compares the locked source with upstream `main`. It skips unrelated commits without changing the lock.

A relevant candidate must pass generation, `npm test`, and `npm run check` before the workflow creates or updates the `automation/update-pstack` PR. A blocked adaptation leaves the lock and generated tree unchanged. The Actions summary and 30-day artifacts retain the report.

The workflow serializes its runs and has a 15-minute timeout. It uses a repository token with contents and pull-request write permissions. It does not merge PRs or install skills.
