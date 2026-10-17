# pstack-t3

A T3 Code adapter for [pstack](https://github.com/cursor/plugins/tree/main/pstack).

pstack-t3 follows the official pstack source and keeps T3 behavior in a shared adapter. The generator copies upstream skills, adds adapter instructions, and produces a tree for installation. Each update includes the upstream commit and a diff of the generated files.

The CLI supports source updates, validation, installation, and rollback. It requires Node.js 22 or later and Git. It uses no npm dependencies.

## Install

Clone this repository and validate the locked upstream source before installation:

```sh
git clone https://github.com/kyoji2/pstack-t3.git
cd pstack-t3
node bin/sync-pstack-t3.mjs fetch
node bin/sync-pstack-t3.mjs generate --check
node bin/sync-pstack-t3.mjs install
```

For an existing p3-stack installation, use `install --migrate-from /path/to/p3-stack`. The installer checks conflicts before changing skill links. It does not import model configuration.

See [Install and update pstack-t3](docs/usage.md) for updates, temporary installations, rollback, and recovery.

## Design documents

[Design](DESIGN.md) explains how this project replaces a rewritten p3-stack installation and why generation makes upstream updates easier to review.

[Implementation specification](docs/implementation.md) describes the files, T3 mappings, commands, and acceptance criteria.

Run `npm test` for the local regression suite. After `fetch`, run `npm run check` to verify the committed generated tree. Copied upstream scripts remain data during these checks. Optional upstream tools may require Bun when a workflow uses them.

## Upstream and license

The design follows the official [pstack generator](https://github.com/cursor/plugins/blob/09d06eb4b97a1020ab31e84030e38baf1099c7dc/scripts/generate-pstack-harness-trees.mjs) at commit `09d06eb4b97a1020ab31e84030e38baf1099c7dc`.

pstack is by poteto. Generated distributions must retain its [MIT license](https://github.com/cursor/plugins/blob/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/LICENSE) and attribution. Original code in this repository uses the [MIT license](LICENSE).

This project is independent of Cursor and T3 Code.
