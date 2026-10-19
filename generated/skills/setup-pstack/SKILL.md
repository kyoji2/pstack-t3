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

Ask for model preferences or a budget when the request does not provide them. The upstream budget labels are `unlimited`, `large`, `medium`, and `small`. These labels are preferences, not price estimates. Use only effort and speed options exposed by the catalog. Do not assume a provider is cheaper or a model is stronger from its name.

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

Single-target roles are `feature, refactoring`, `bug-fix`, `perf-issue`, `hillclimb`, `judgment and prose`, `hardest tasks`, `how explorer`, `how explainer`, `why investigators`, `why synthesizer`, `reflect tooling`, `reflect judgment, divergent, synthesizer`, and `swarm workers`.

Panel roles are `arena runners`, `architect runners`, and `interrogate reviewers`. Each array entry creates one seat. `arena cross-judge pool` is also an array, but supplies candidates for one judge. Prefer a judge from a different model family than the parent. Multiple providers do not necessarily supply different model families.

The sample panel uses inheritance to illustrate the format. It does not satisfy a request for different model families. Configure explicit available models for that request. When the catalog lacks enough distinct choices, explain the limitation before writing or spawning.

## Validate and report

Check the JSON syntax, version, exact role names, target fields, each selected model, and all option values against the live catalog. Panel arrays must be nonempty. Write the whole file after validation so repeated setup produces one configuration.

Report the written path, the selected budget, the panel sizes, and any roles that inherit the parent. Do not write Cursor `.mdc` files or add these roles to `AGENTS.md` or `CLAUDE.md`. The [T3 adapter](../pstack-t3-adapter/SKILL.md) reads this configuration explicitly.
