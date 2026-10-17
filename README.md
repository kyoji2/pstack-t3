# pstack-t3

A T3 Code adapter for [pstack](https://github.com/cursor/plugins/tree/main/pstack).

pstack-t3 follows the official pstack source and keeps T3 behavior in a shared adapter. A generator will copy upstream skills, add the adapter instructions, and produce a tree for installation. Each update will include the upstream commit and a diff of the generated files.

This repository contains an approved design. The generator, adapter, and installer are not implemented yet.

## Design documents

[Design](DESIGN.md) explains how this project replaces a rewritten p3-stack installation and why generation makes upstream updates easier to review.

[Implementation specification](docs/implementation.md) defines the proposed files, T3 mappings, commands, and acceptance criteria.

## Upstream and license

The design follows the official [pstack generator](https://github.com/cursor/plugins/blob/09d06eb4b97a1020ab31e84030e38baf1099c7dc/scripts/generate-pstack-harness-trees.mjs) at commit `09d06eb4b97a1020ab31e84030e38baf1099c7dc`.

pstack is by poteto. Generated distributions must retain its [MIT license](https://github.com/cursor/plugins/blob/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/LICENSE) and attribution. Original code in this repository uses the [MIT license](LICENSE).

This project is independent of Cursor and T3 Code.
