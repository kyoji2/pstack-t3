# Implementation specification

This document specifies the proposed implementation. The files, commands, and behaviors below do not exist yet.

## Repository layout

The proposed layout separates source tracking, adaptation, generation, and installation.

```text
upstream.lock.json
adapter/
	t3.md
	rules.json
overrides/
	setup-pstack/
		SKILL.md
scripts/
	sync-upstream.mjs
	generate-t3-tree.mjs
	install.mjs
generated/
	skills/
	agents/
	docs/harness/t3.md
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
- Copy upstream agent documents and the upstream license.
- Preserve executable permissions on copied files.
- Scan Markdown files, including playbooks and references, for platform-specific concepts.
- Add a T3 adapter instruction to every skill entry point without changing its frontmatter. Repeated generation adds the instruction once.
- Apply declared replacement files after validating their reviewed upstream hashes. A changed upstream file blocks its replacement until review updates the recorded hash.
- Keep relative links when their targets exist in the generated tree. Convert links to omitted upstream documents into GitHub URLs at the locked commit.
- Validate file targets, directory targets, query strings, fragments, and source-root boundaries. Report unresolved local targets.
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
| Agent types | Include the generated agent document path and a requirement to read it in the child brief. |
| Read-only work | Prohibit edits in the brief and verify the resulting state. Runtime permission modes do not provide a read-only switch. |
| Cloud workers | Use `delegate_task` with `isolation: "worktree"` for an isolated child. The child starts from the parent's local commit. It does not receive uncommitted edits. |
| `cloud_base_branch` | Resolve the requested baseline explicitly. Report a baseline that the chosen delegation API cannot express. |
| Top-level conversations | Use `t3_thread_launch` when the user requests a separate top-level conversation. The launch request binds its workspace. |
| Independent review rounds | Create a new task with the original brief, previous findings, responses, and unresolved objections. Each round has a distinct request ID. |
| Stateful follow-ups | Reuse a child conversation only when the follow-up requires its existing state and the current tool contract permits reuse. |
| PR watching | Use `watch_pull_request` and its notification lifecycle. |
| Recurring work | Use `schedule_task` with a structured schedule when the user requests persistent recurring work. A single autonomous run does not imply a recurring schedule. |
| Transcript inspection | Use `t3_thread_search` and `t3_thread_read` within the relevant project. |
| Skill routing | Read the generated target `SKILL.md` when the host cannot invoke the skill through a tool. |
| Browser and device evidence | Use the host's available tools, including T3 preview and device tools when exposed. Report missing capabilities. |

## Skill names and aliases

Canonical names match upstream. Optional migration aliases map `p3-mode` to `poteto-mode`, `p3-help` to `poteto-help`, and `setup-p3` to `setup-pstack`.

Each alias has its own frontmatter name and reads the canonical skill. Aliases contain no duplicate workflow instructions.

## Model configuration

The replacement `setup-pstack` reads `orchestrator_capabilities` and writes `pstack-models.md`. A project file takes precedence over `~/.agents/pstack-models.md`. Skills read the file explicitly.

Configured provider IDs, model IDs, and options must match the live catalog. An omitted target inherits the parent where the tool supports inheritance. Explicit panel sizes and model diversity remain part of the requested configuration. Unavailable choices produce a diagnostic rather than silently reducing a panel to one model.

The import from `p3-models.md` preserves valid user choices and reports unknown or retired roles. Changes to upstream roles appear in the update report. User model files remain outside this repository.

## Command interface

The proposed executable is `sync-pstack-t3`.

| Command | Result |
| --- | --- |
| `status` | Report the locked and installed versions. When online, report whether relevant upstream content changed. Distinguish network failures from an unchanged source. |
| `update --ref main` | Resolve the reference, compare sources, generate a candidate tree, and report changes. Publish the lock and tree after validation passes. Leave the installed version unchanged. |
| `generate --check` | Compare expected output with the generated tree, including stale files and executable permissions. Write no files. |
| `install` | Install a validated version and record the managed links and previous targets. |
| `rollback` | Restore the previous installation after checking for changes to managed paths. |

A failed update leaves the previous lock and generated tree usable.

## Update report

The report includes the following changes:

- Added, removed, and modified skills, playbooks, references, and scripts.
- Changes to detection rules in the upstream generator and to the upstream adapter document.
- New platform terms and changed model roles.
- Changes to designated documents about delegation, isolation, models, scheduling, watching, and installation.
- Changed upstream files whose local replacements require review.

Unknown platform requirements produce diagnostics. Term detection does not establish compatibility for arbitrary changes to prose.

## Installation state

The initial default target is `~/.agents/skills`. The installer also accepts an explicit target directory. Support for other hosts requires a discovery test.

The installation manifest lives outside the generated tree and tracked repository files. It records the installed version, managed link paths, and previous targets.

The installer has the following requirements:

- Install from an immutable local version directory.
- Preserve the complete tree because skills refer to sibling skills, agent documents, and the adapter.
- Validate all destination conflicts before changing links.
- Refuse to overwrite unmanaged files, directories, or links.
- During explicit p3 migration, identify old links by their resolved source ownership.
- Remove a retired link only when it still matches a previously managed link.
- Preserve the state needed to restore the previous version and original p3 links.
- Report changed paths before rollback and preserve those paths.

The migration retains the old p3-stack checkout and unrelated installed skills.

## Acceptance criteria

Automated tests cover the following behavior:

1. Identical locked inputs produce identical output. `generate --check` detects content, file-set, and permission changes without writes.
2. The tree includes all skills and required references. Adapter injection preserves valid frontmatter and executable permissions.
3. Links to omitted documents use the locked commit. Invalid source paths and paths outside the source root fail validation.
4. New detected platform requirements and changed replacement baselines produce actionable errors.
5. Failed updates preserve the previous lock and generated tree.
6. Installation refuses unmanaged collisions and removes only retired managed links. Rollback restores the previous installation without overwriting changed paths.
7. Model imports retain valid choices and report unavailable targets or changed role definitions.

Runtime validation uses a temporary installation before the real installation changes. Representative runs cover model selection, a child in an isolated worktree, a fresh review round, skill routing, and PR-watch handling.

Static file checks and runtime observations are separate evidence. Successful generation does not prove that an agent follows the adapter.

## Delivery order

Implementation proceeds in this order:

1. Source locking, deterministic generation, the adapter, and update reports.
2. The setup replacement and compatibility aliases, including source-change checks.
3. Automated tests and representative T3 runs.
4. Managed installation, migration, and rollback.
5. Migration of the real local installation.

Scheduled upstream checks and automatic update PRs are later work. Upstream updates never install themselves.
