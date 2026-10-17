# Design

## Goal

Replace a separately rewritten p3-stack installation with a generated T3 Code adaptation of official pstack. Make upstream updates easy to identify, review, reproduce, install, and roll back.

Keep this project in its own public repository. Do not depend on a dotfiles checkout or embed machine-specific paths, local model catalogs, or user settings.

## Source and ownership

The source of truth is `https://github.com/cursor/plugins`, specifically `pstack/` and the upstream harness generator. Fetch an exact commit recorded in `upstream.lock.json`. An update may resolve a moving reference such as `main`, but generation uses the resolved commit only.

Do not execute upstream scripts during synchronization or generation. Copy selected runtime assets as data, preserving executable permissions and the upstream license. Reject source symlinks or paths that escape the source root.

Keep source checkouts in an ignored local cache. Commit generated output for review. Generation must work offline once the locked source is available.

## Planned layout

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

Use Node.js and built-in modules for the initial implementation. Avoid an upstream fork and avoid adding a package dependency solely for file copying or command-line parsing.

## Generator

1. Validate the locked source and expected upstream layout.
2. Discover skills containing `SKILL.md`; copy each complete skill directory, agent documents, and the license.
3. Scan Markdown, including playbooks and references, for platform-specific concepts.
4. Inject a T3 adapter instruction into every skill entry point. Keep frontmatter valid and make injection idempotent. The adapter governs platform execution; upstream skills govern workflow, subject to session instructions and actual tool contracts.
5. Apply declared overrides. Record each overridden source file and its reviewed source hash. Fail when an overridden upstream file changes until the override is reviewed and its baseline explicitly updated.
6. Keep links within the generated tree when the target is included. Rewrite links to omitted upstream documents to GitHub URLs pinned to the locked commit. Validate file and directory targets, root boundaries, query strings, and fragments. Report unresolved local targets.
7. Write deterministic provenance containing the upstream commit, generator format version, adapter and override hashes, and per-file source attribution. Do not include timestamps, absolute paths, or local machine details.
8. Build in a staging directory and publish only after validation succeeds. `--check` compares the expected tree with disk, including stale files and executable permissions, without modifying output.

Do not copy Claude Code manifests and assume they represent T3 packaging. The initial installation target is a skill directory tree, not an unverified T3 plugin format.

## T3 adapter

The adapter must express behavior, not merely rename tools.

| Upstream concept | T3 behavior |
| --- | --- |
| `Task` | Use the appropriate available delegation tool; use `delegate_task` for T3-owned children and models unsupported by native tools. |
| Available models | Resolve provider instances, model identifiers, and supported options through `orchestrator_capabilities`. Never infer T3 identifiers from Cursor slugs. |
| Background work | Prefer async delegation and completion notifications. Read task status when a result is needed during the current turn. Do not poll continuously. |
| Agent types | Put the relevant generated agent document path and a requirement to read it in the child brief. |
| Read-only work | Explicitly prohibit edits in the brief and verify the resulting state. Permission modes are not a read-only switch. |
| Cloud isolation | Use `delegate_task` with `isolation: "worktree"` for an isolated child. It starts from the parent local commit; uncommitted edits are not copied. |
| Branch baseline | Handle `cloud_base_branch` explicitly. Do not silently drop a baseline the delegation API cannot express. |
| Top-level threads | Use `t3_thread_launch` only when the user requests separate top-level conversations. Bind the workspace in the launch request. |
| Independent review rounds | Create a new delegated task with the original brief, previous findings, responses, and unresolved objections; use a distinct request ID per round. |
| Stateful follow-ups | Use child conversation follow-up only when it requires existing child state and is compatible with the current tool contract. |
| PR watching | Use `watch_pull_request` and its notification lifecycle. |
| Persistent recurring work | Use `schedule_task` with a structured schedule when the user requests recurring work. Preserve the distinction from a single autonomous run. |
| Transcript inspection | Use `t3_thread_search` and `t3_thread_read`, scoped to the relevant project. |
| Skill routing | Read the generated target `SKILL.md` directly when the host cannot invoke it through a skill tool. |
| Browser/device evidence | Use the tools available to the host, including T3 preview/device tools when exposed. Report missing capabilities explicitly. |

Preserve `poteto-mode`, `poteto-help`, and `setup-pstack` as canonical upstream names. Optional thin aliases may retain `p3-mode`, `p3-help`, and `setup-p3` during migration. Alias frontmatter must use the alias name and route to the canonical skill without duplicating its body.

## Model configuration

Override `setup-pstack`, whose Cursor rule-writing workflow does not map directly to T3.

Use project `pstack-models.md`, falling back to `~/.agents/pstack-models.md`. Read configuration explicitly rather than assuming the host automatically loads it. Resolve configured provider/model/options against the live capability catalog. Omitted targets inherit the parent where supported. Keep panel cardinality and model diversity intentional; do not silently collapse an explicit cross-model panel to the same model.

Offer a one-time import of existing `p3-models.md` with validation. Preserve user choices and report unknown or retired roles. User model configuration is not committed to this public repository.

Track upstream role changes so additions and removals are visible rather than hidden behind the override.

## Update workflow

Planned command interface:

```sh
sync-pstack-t3 status
sync-pstack-t3 update --ref main
sync-pstack-t3 generate --check
sync-pstack-t3 install
sync-pstack-t3 rollback
```

These commands are proposed, not implemented yet.

`status` reports the locked and installed versions and, when online, whether relevant upstream content changed. Network failures must be distinguishable from an up-to-date result.

`update` resolves a candidate reference, compares it with the locked source, generates a candidate tree, and reports:

- Added, removed, and modified skills, playbooks, references, and scripts.
- Changes to the upstream generator's detection rules and harness adapter.
- New platform terms and changes to model roles.
- Changes in declared high-impact documents covering delegation, isolation, models, scheduling, watching, and installation.
- Override baseline conflicts requiring review.

Only publish the candidate lock and generated tree after required checks pass. Updating repository artifacts does not install them. A failed update preserves the prior usable tree.

Known-term coverage is a guardrail, not proof of semantic compatibility. High-impact natural-language changes remain review items. Unknown requirements must produce a useful diagnostic instead of silently selecting a fallback.

Start with manual updates and local checks. Add scheduled upstream checks or update PR automation after the report and validation behavior is proven. Do not auto-install upstream changes.

## Installation and migration

Support an explicit skills target directory, with `~/.agents/skills` as the initial default. Test host discovery before describing other harnesses as supported.

Keep a local installation manifest recording source release, managed link paths, and previous targets. It must live outside the generated tree and public tracked files.

- Refuse to overwrite unmanaged files, directories, or links.
- During explicit p3 migration, identify old links by their resolved source ownership, not just their names.
- Validate all collisions before changing any link.
- Install from an immutable local version directory so changing a development checkout cannot silently change installed skills.
- Preserve the complete tree layout because skills link to sibling skills, agents, and adapter documents.
- Remove retired entries only if they still match a previously managed link.
- Record enough state to restore the previous version and original p3 links.
- Detect local modifications or replaced links before rollback; do not overwrite them.

The old p3-stack checkout is retained during migration. Unrelated skills remain installed.

## Acceptance criteria

Automated checks should cover meaningful behavior:

1. Identical locked inputs produce identical output, and `--check` detects content, file-set, and permission drift without writes.
2. All skills and required references are included; injected instructions preserve valid frontmatter and executable assets retain their mode.
3. Links to omitted documents use the locked commit; invalid or escaping source paths are rejected.
4. Newly introduced detected platform requirements and changed override baselines fail with actionable diagnostics.
5. Failed updates leave the previous lock and generated tree usable.
6. Installation refuses unmanaged collisions, handles retired managed entries, and restores the previous installation on rollback.
7. Model configuration imports retain valid choices and report unavailable targets or changed role definitions.

Before switching the real installation, exercise representative workflows in a temporary target: model selection, a worktree child, a fresh review round, cross-skill routing, and PR-watch handling. Separate prompt behavior observations from static file validation; generation alone cannot prove agents obey the adapter.

## Delivery order

1. Implement the lock, deterministic generator, adapter, and source-change report.
2. Add the setup override and compatibility aliases with explicit drift checks.
3. Validate fixture behavior and representative T3 workflows.
4. Implement managed installation, migration, and rollback.
5. Switch the local installation after validation.
6. Add upstream update automation as a later enhancement.
