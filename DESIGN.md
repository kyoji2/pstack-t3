# Design

## Why generate the T3 version

p3-stack adapts pstack by rewriting its skills for T3 Code. Those edits include tool names, model selection, delegation, and entry-point names. When upstream changes a skill, the maintainer must separate the upstream change from the T3 rewrite.

pstack-t3 moves the shared T3 behavior into one adapter document. A generator copies the official skills and adds an instruction to read that adapter. Most upstream files then reach the generated tree without changes to their bodies.

The official [Claude Code generator](https://github.com/cursor/plugins/blob/09d06eb4b97a1020ab31e84030e38baf1099c7dc/scripts/generate-pstack-harness-trees.mjs) uses this approach. It copies skills and agents, adds adapter instructions, repairs links, and checks the result for drift. pstack-t3 extends that design with a pinned source commit, reports of source changes, and managed installation.

## The boundary between upstream and T3

Upstream owns the skills, playbooks, principles, and agent documents. The T3 adapter defines how an agent executes platform-specific instructions. Current session instructions and tool contracts take precedence over both.

A tool-name substitution cannot express every difference. A Cursor cloud worker maps to an isolated T3 child task, but an independent top-level conversation requires a separate user request. Model names must come from T3's live catalog. A later review round needs a new task with the earlier findings in its brief.

The adapter records those distinctions once. Every generated skill entry point tells the agent to read it, including skills whose platform requirements appear only in a linked playbook.

Some workflows need a replacement document. The first is `setup-pstack`, which writes a Cursor rule file. Its T3 replacement reads the live model catalog and writes a role configuration that the skills load explicitly. Each replacement has a recorded upstream source hash. A change to that source requires review before the generator accepts the replacement again.

## Names and model choices

Canonical skill names stay aligned with upstream, including `poteto-mode`, `poteto-help`, and `setup-pstack`. Renaming every reference would create more differences to maintain. Thin aliases can preserve the old p3 entry points during migration.

Model choices belong to the user. The proposed configuration is `pstack-models.md`, with a project file taking precedence over the global file. The setup workflow creates this configuration from the live T3 model catalog. User model files remain outside this public repository.

## Updates need a fixed source and a reviewable result

The lock file identifies an exact commit in `cursor/plugins`. An update can resolve `main`, but generation always uses the resulting commit. Links to omitted upstream documents use that same commit, so the linked instructions match the installed version.

The source checkout stays in an ignored cache. The generated tree is committed. This adds generated files to the repository, but lets a reviewer inspect the instructions that agents will receive without running the generator.

An update report separates content changes from adaptation work. It lists changed skills, changed platform requirements, model-role changes, and replacement files that need review. It also flags changes to documents about delegation, isolation, scheduling, and PR watching.

Term detection has a limit. It can identify a new tool name, but it cannot prove that a rewritten paragraph preserves the same behavior. Changes to those documents still need human review and representative T3 runs.

## Installation is separate from updates

Updating the repository prepares a candidate version. Installation changes which version the local agent reads. Keeping those actions separate allows review before an update affects active work.

The installer uses an immutable local version directory and records the links it manages. It checks all destination conflicts before changing links. During p3 migration, it replaces links only when their resolved targets belong to the old installation.

Rollback restores the recorded previous links. If another process has changed a managed path, rollback reports the conflict instead of overwriting it. The old p3-stack checkout remains available during migration.

## Initial scope

The first release covers source locking, generation, update reports, the setup replacement, compatibility aliases, installation, and rollback. Validation includes temporary installations and representative T3 workflows before the real installation changes.

Scheduled update checks and automatic update PRs come later. The first implementation needs to produce useful reports and preserve a working installation when an update fails.

The [implementation specification](docs/implementation.md) defines the proposed behavior and acceptance criteria.
