# Initial validation

The first implementation was validated on macOS with Node.js 26.8.2. The locked upstream commit is `09d06eb4b97a1020ab31e84030e38baf1099c7dc`.

## File and installation checks

The initial `npm test` run passed 24 tests. After removal of the compatibility layer, all 25 current tests pass. The suite covers deterministic generation, link handling, source symlink rejection, changed adapter baselines, failed updates, installation conflicts, rollback, concurrent-operation locks, and interrupted-operation recovery.

`npm run check` confirmed that the committed generated tree matches the locked source and adapter inputs. After removal of the compatibility layer, the generator produces 137 files, including 54 upstream skills. These counts can be reproduced with `npm run generate` and the skill entries in `generated/provenance.json`.

A temporary installation completed this sequence through the CLI:

1. Install all generated skills.
2. Read the installed version and skill count with `status`.
3. Roll back to no managed skills.
4. Install the same version again.
5. Roll back again.

The regression suite separately verifies preservation of unrelated directories and links. It also checks that rollback refuses to overwrite changed paths or restore a modified version directory.

## Agent observations

A separate T3 child read the generated canonical skill and adapter through their relative links. It read the live model catalog and returned the expected mappings for isolated children, independent review rounds, PR watching, and model IDs containing slashes.

The child also identified the required responses to an unavailable diverse panel and a baseline that differs from the parent commit. It did not create worktrees, watch PRs, create schedules, or write a model configuration. Those observations establish how one agent interpreted the instructions, not successful execution of those workflows.

## CI

[The validation workflow](../.github/workflows/validate.yml) runs the regression suite and generated-tree check on Linux and macOS with Node.js 22 and 24. All four jobs passed for implementation commit `f810bab` in [run 39000423828](https://github.com/kyoji2/pstack-t3/actions/runs/39000423828). Later results are available in [GitHub Actions](https://github.com/kyoji2/pstack-t3/actions).

The workflow fetches upstream source as data. It does not run copied upstream scripts or install skills into a user's home directory.
