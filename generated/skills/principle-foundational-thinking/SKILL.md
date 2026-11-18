---
name: principle-foundational-thinking
description: "Apply before writing logic: choosing core types and data structures, sequencing scaffold-vs-feature work, asking what concurrent actors share. Get the data structures right so downstream code becomes obvious."
disable-model-invocation: true
---

<!-- pstack-t3 adapter -->
Before following this skill, read [the T3 adapter](../pstack-t3-adapter/SKILL.md). Its platform mappings apply to this skill and its linked files. If you cannot read it, stop and tell the user.

# Foundational Thinking

Get the data shape right before writing logic. Define core types early, trace every access pattern, and choose structures that match the dominant paths. DRY the structure, not every line.

Before sharing state between actors, ask what happens if another actor modifies it concurrently. If the answer is not "nothing", isolate.

Scaffold first. Whatever helps every later phase (CI, tests, shared types) goes first, after removing dead code. Keep commits small and single-purpose.
