---
name: setup-pstack
description: Configure pstack model roles from the live T3 Code catalog. Use for /setup-pstack, pstack budget, or changing pstack model choices.
disable-model-invocation: true
---

<!-- pstack-t3 adapter -->
Before following this skill, read [the T3 adapter](../pstack-t3-adapter/SKILL.md). Its platform mappings apply to this skill and its linked files. If you cannot read it, stop and tell the user.

# Set up pstack models

Create `pstack-models.md` using models and options available in this T3 session.

## Read the live catalog

Call `orchestrator_capabilities`. Discover the tool if it is not loaded. Use its exact provider instance IDs, model IDs, and option definitions. If the catalog is unavailable, report the failure and stop before writing configuration.

Read project-root `pstack-models.md` if present, otherwise `~/.agents/pstack-models.md`. A project configuration takes precedence as a complete file. Do not merge the two files implicitly. Preserve existing valid user choices when updating a file.

## Choose the configuration

Use the location the user requested. If no location is specified, ask whether to use the current project or the global file. If the user already authorized a location or choices, proceed with them.

Ask for model preferences or a budget when the request does not provide them. The upstream budget labels are `large`, `medium`, and `small`. Upstream moves effort from each role's starting level: `large` keeps it, `medium` lowers it one step, and `small` lowers it two steps on the ladder `xhigh` > `high` > `medium` > `low`. No role runs above `xhigh`, and a model whose catalog top is lower runs at that top. A stored `unlimited` budget becomes `large`. These labels are preferences, not price estimates; translate them only when the catalog exposes compatible options and the role has a known starting level. Otherwise ask for a choice. Do not assume a provider is cheaper or a model is stronger from its name.

Upstream's default Gemini panel seat is Gemini 4 Neon at xhigh. Its own budget target is xhigh for large, high for medium, and medium for small, even when the other panel seats have a different starting effort. If offering that default, select Neon and the budget-adjusted effort only when the live catalog exposes a compatible target and option; otherwise ask for a choice. Upstream migrates older Gemini 4 panel slugs and Neon high to Neon xhigh in Cursor rules, but do not automatically migrate existing T3 targets or change an explicit user choice.

Show proposed roles and choices before writing unless the user has already authorized those choices. Report unavailable targets and unknown or retired roles. Never silently replace an explicit model. Preserve the requested panel size and model-family diversity.

## Write the configuration

Write a Markdown document with one fenced JSON block. Use this structure, replacing the abbreviated `roles` object with every role listed below:

```json
{
	"version": 1,
	"budget": "large",
	"roles": {
		"feature, refactoring": "inherit-parent",
		"arena runners": ["inherit-parent", "inherit-parent"]
	}
}
```

A target is `"inherit-parent"` or an object of this shape:

```json
{
	"providerInstanceId": "<exact instance ID from the catalog>",
	"model": "<exact model ID from the catalog>",
	"options": [
		{ "id": "<supported option ID>", "value": "<supported value>" }
	]
}
```

Omit `options` when none apply. Never write the placeholder values above. Keep provider and model in separate fields because model IDs can contain slashes.

Single-target roles are `feature, refactoring`, `bug-fix`, `perf-issue`, `hillclimb`, `judgment and prose`, and `swarm workers`. The `hardest tasks`, `reflect tooling`, `reflect judgment, divergent, synthesizer`, `how explorer`, `how explainer`, `why investigators`, and `why synthesizer` roles are retired. Report them when present; retain them until the user authorizes their removal.

Panel roles are `arena runners` and `interrogate reviewers`. The `architect runners` role is retired and reported the same way. Each array entry creates one seat. `arena cross-judge pool` supplies candidates for one judge in preference order. Only an explicit model known to be from a different vendor than the parent can judge. Fable and other Claude models are one vendor, even though they are separate runner families. Inherited entries cannot judge, and multiple provider instances do not necessarily supply different model vendors. If no eligible model can be established, Arena skips the judge and reports why.

The sample panel uses inheritance to illustrate the format. It does not satisfy a request for different model families or Arena's different-vendor judge. Configure explicit available models for those requests. When the catalog lacks enough distinct choices, explain the limitation before writing or spawning. Upstream Cursor slug defaults and its `# defaults: 2` and `# defaults: 3` migrations do not identify live T3 models or choices in this JSON format; never automatically replace existing T3 targets based on those slugs.

## Validate and report

Check the JSON syntax, version, active role names, target fields, each selected model, and all option values against the live catalog, with every offered effort at `xhigh` or below. Report a stored option above `xhigh` rather than silently lowering it. Report retained retired or unknown entries separately rather than treating them as active roles. Panel arrays must be nonempty. Write the whole file after validation so repeated setup produces one configuration.

Report the written path, the selected budget, the panel sizes, and any roles that inherit the parent. Do not write Cursor `.mdc` files or add these roles to `AGENTS.md` or `CLAUDE.md`. The [T3 adapter](../pstack-t3-adapter/SKILL.md) reads this configuration explicitly.

## Offer project verification skills

Check whether the project has a way to drive the real app for proof, such as a `verify-*` skill or an existing harness. If it has neither, offer once to generate a project-local verification skill with [create-verification-skill](../create-verification-skill/SKILL.md). Run that skill if the user accepts. If they decline, continue without pushing.

Then check whether the project has a skill that runs a model checker, proof, or another verifier against its code. If it has none, offer once to generate a formal verification skill with [create-formal-verification-skill](../create-formal-verification-skill/SKILL.md), explaining that it checks a key property in every case within a stated scope. Run that skill if the user accepts. If they decline, finish without pushing. Existing authorization to create either skill is sufficient to proceed.
