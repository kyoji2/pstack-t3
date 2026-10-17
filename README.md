# pstack-t3

A T3 Code adapter for [pstack](https://github.com/cursor/plugins/tree/main/pstack).

The goal is to follow official pstack updates while keeping T3-specific behavior in a small, reviewable adaptation layer. Skills, playbooks, and principles come from upstream; a deterministic generator will build an installable T3 tree.

**Status: design approved; implementation pending.** This repository currently contains the design, not an installer or working adapter.

## Planned approach

- Pin the official `cursor/plugins` source to a Git commit.
- Preserve upstream skill names and content by default.
- Inject instructions to read a shared T3 adapter.
- Use explicit overrides only where runtime mapping is insufficient.
- Commit the generated tree so updates can be reviewed as ordinary diffs.
- Report upstream changes, adapter coverage changes, and override conflicts before installation.
- Install and roll back only managed skill links.

See [DESIGN.md](DESIGN.md) for the architecture, update workflow, migration plan, and acceptance criteria.

## Upstream

Reference generator: [`scripts/generate-pstack-harness-trees.mjs`](https://github.com/cursor/plugins/blob/09d06eb4b97a1020ab31e84030e38baf1099c7dc/scripts/generate-pstack-harness-trees.mjs).

Initial design reference commit: `09d06eb4b97a1020ab31e84030e38baf1099c7dc`.

This project is independent of Cursor and T3 Code. Upstream pstack is credited to poteto and distributed under its own [MIT license](https://github.com/cursor/plugins/blob/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/LICENSE). Generated distributions must preserve that license and attribution. Original code in this repository is MIT licensed.
