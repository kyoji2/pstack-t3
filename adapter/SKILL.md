---
name: pstack-t3-adapter
description: Platform mappings that every pstack skill reads first. Maps Cursor tools, models, paths, and agents to T3 Code and to hosts without T3. Not invoked directly.
disable-model-invocation: true
---

# pstack in T3 Code

Read this adapter before a pstack skill and apply it to every linked playbook, reference, and agent brief. If a skill points here and you cannot read this file, stop and tell the user. Do not continue without it.

## Paths

This skill lives beside the pstack skills. Resolve every path from the skill path the host reported, without following symlinks to a real directory.

- A sibling skill is `../<name>/SKILL.md`. Upstream text that names `<pstack>/skills/<name>/SKILL.md` means that path.
- An upstream agent document `agents/<name>.md` is `agents/<name>.md` beside this file.
- A skill's bundled scripts, playbooks, and references stay relative to that skill's directory.

Do not search the disk or the network for a file that these rules locate.

## Detect T3 Code

You are in T3 Code when the session instructions say so, or when `delegate_task` or `orchestrator_capabilities` is callable. The host being pi, Claude, or Codex does not decide this, because T3 can run any of them. `T3_MCP_URL` in the environment is a weak hint. Check only that it is set and never print it, because related variables hold credentials.

Outside T3 Code, the routing, path, model, and Cursor-plugin mappings below still apply. Change these things:

- Treat T3 tool names (`delegate_task`, `orchestrator_capabilities`, `schedule_task`, `watch_pull_request`, `link_pull_request`, `preview_*`, `device_*`) as unavailable.
- Cursor `Task` means the host's own subagent tool. If there is none, do the work in this session and report that independent review did not happen.
- Read the agent documents under `agents/` and follow them in this session when a worker cannot be spawned.
- Models cannot come from a T3 catalog. Inherit the host model unless `pstack-models.md` names a target the host accepts.
- Report a mapped step that needs T3 as blocked. Do not emulate it.

## Scope

This document maps platform behavior. The skill supplies the workflow. Session instructions, user authorization, and actual tool schemas take precedence. Never send a field that the chosen tool rejects. Never infer permission to send external messages, merge, deploy, delete data, or create recurring work from an upstream autonomy paragraph.

## Tools and skill routing

<!-- covers:task -->
Cursor `Task` means delegated work. Discover T3 tools when they are not loaded yet. Use `orchestrator_capabilities` to choose from the full live catalog. Prefer a native same-provider subagent tool only if it supports the chosen model. Use T3 `delegate_task` for T3-owned children, cross-provider work, and models the native tool cannot select.

<!-- covers:question -->
`AskQuestion` means the host's structured question tool when available. Otherwise ask the user in text. Keep optional clarification separate from work that can proceed. A required answer cannot be replaced by elapsed time.

<!-- covers:todo -->
A todolist uses the host's plan tool when available. Otherwise maintain the steps in a concise local task note or the reply. Do not claim a tool exists because the upstream skill names it.

<!-- covers:routing -->
To run another pstack skill, read `../<name>/SKILL.md` and follow it. This also applies to bare skill names and `/name` commands. Do not assume Cursor's command namespace or custom-mode shortcuts exist. State the actual entry point supported by the host.

`Grep` and `Glob` map to the host's search tools or shell `rg` and `rg --files`. File reads use the host's read tool. `/create-skill` means author a skill in the supported skills directory and validate its frontmatter and links.

## Delegation

<!-- covers:agent -->
`subagent_type: generalPurpose` means a general worker with the required tool access. `poteto-agent` and `comment-sicko` are instructions in [agents/poteto-agent.md](agents/poteto-agent.md) and [agents/comment-sicko.md](agents/comment-sicko.md), not registered T3 agent types. Begin the worker brief with the document's absolute path and a requirement to read it. A child does not share your working directory, so never pass a relative path. Include this adapter's absolute path as well.

<!-- covers:readonly -->
`readonly: true` means the brief prohibits file edits, commits, and other state changes. Verify the resulting checkout state. `readonly: false` means normal task permissions. T3 runtime modes are approval policies, not a read-only switch. Leave `runtimeMode` unset unless the user requests a supervised child.

<!-- covers:background -->
Use `mode: "async"` for background T3 delegation. Retain each `taskId`. Completion notifications wake the parent. End the turn when only delegated work remains. Use `task_status` when the result is needed during the current turn and `task_cancel` to stop it. A wait timeout does not cancel a child. Do not spawn polling agents or wait loops.

Every child brief stands alone. Include the goal, scope, source paths, constraints, required adapter and agent documents, expected verification, and report format. A T3 child receives only the supplied prompt. Keep one writer per checkout when parallel tasks can touch the same files.

<!-- covers:environment -->
`environment: "cloud"` means an isolated child when T3 owns the work. Use `delegate_task` with `isolation: "worktree"`. The checkout starts from the parent's current local commit after project setup. Uncommitted edits are not copied. Commit required inputs before starting the child, within the user's authorization. These are local worktrees, not remote machines.

`environment: "local"` means access to the current machine. It does not require shared writes. Use shared isolation only when the task needs that checkout and concurrent writers cannot conflict.

<!-- covers:baseline -->
`cloud_base_branch` is a baseline requirement. T3 child isolation has no base-ref field. Confirm that the parent's local commit is the requested baseline before spawning. If it differs, report the mismatch and choose a tool-supported workflow within the user's authorization. Never silently ignore the branch or ask a child to reset a shared checkout.

A top-level thread is distinct from a child. Use `t3_thread_launch` only when the user asks for separate top-level conversations, and bind the checkout with `workspaceStrategy` in that request. A request for an isolated child alone does not authorize a top-level thread.

<!-- covers:resume -->
Independent review rounds use a fresh `delegate_task`. Include the original brief, previous findings, responses, and unresolved objections. Use a distinct `clientRequestId` for each round, stable across retries of that round. The child thread ID is storage, not an independent-review continuation target.

A follow-up that requires a child's existing process or uncommitted state may use `t3_thread_send` on its `childThreadId`, subject to the current tool contract. Stop orders can target a running child. Check status without sending a resume message. Handle pending child questions with T3 pending-request tools or ask the user.

<!-- covers:attachments -->
`file_attachments` means paths that the child can access, listed in the brief. A parent-local or uncommitted file is not automatically present in an isolated checkout. Use supported attachment APIs when paths are insufficient. Never invent an attachment field.

## Models and roles

<!-- covers:models -->
Cursor model slugs such as `claude-*`, `grok-*`, and `gpt-*` do not identify T3 targets. Resolve provider instance IDs, exact model IDs, and supported options through `orchestrator_capabilities`. Preserve model IDs containing slashes. Do not split a combined provider/model string or guess an effort option from a slug.

<!-- covers:modelconfig -->
Read project-root `pstack-models.md` if present. Otherwise read `~/.agents/pstack-models.md`. The file contains the JSON configuration described by [setup-pstack](../setup-pstack/SKILL.md). No `.mdc` rule is loaded.

A role entry is `"inherit-parent"` or an object with `providerInstanceId`, `model`, and optional `options`. Validate targets and each option against the live catalog before spawning. The aliases `auto` and `inherit-parent` in upstream instructions both mean inherited selection. Omit `target` for an inherited T3 child. Inheritance does not change the parent model or effort.

For an unconfigured single role, inherit the parent and report that choice. An explicit unavailable choice requires a valid replacement, not a silent fallback. A requested diverse panel needs enough distinct valid choices. If the configuration cannot supply them, run setup or ask the user before spawning. Never silently collapse a cross-model panel to the parent model.

Each entry in a panel array creates one seat, including repeated inherited entries. For Arena's cross-judge, consider explicit `arena cross-judge pool` entries in order and select only a model known to be from a different family than the parent. Inherited entries cannot judge. Provider diversity alone does not prove model-family diversity. If the parent's family or a candidate's family cannot be established, or no eligible configured target is available, skip the judge and report why; do not guess a family or substitute an unconfigured model. `swarm workers` is one default target unless a race supplies targets per arm. Never infer model capability or price from provider names.

Interrogate's adversaries need writable isolated checkouts for reproductions. A T3 worktree starts at the parent's commit and excludes uncommitted changes. Preserve the review scope by transferring those changes into each isolated checkout without overwriting unrelated work, subject to the host's supported tools and the user's authorization. If the full scope cannot be transferred, report the gap rather than claiming it was reviewed. Re-run findings only when doing so is authorized and safe.

The budget chooses only options exposed by the catalog. A fast suffix has no direct T3 equivalent. Change effort or speed only through a supported option and preserve explicit user choices. If the catalog is unavailable, report the limitation before a workflow that needs explicit or diverse models.

## Paths and conversation history

<!-- covers:skills-path -->
`.cursor/skills/` and `~/.cursor/skills/` map to project `.agents/skills/` and `~/.agents/skills/` for this installation. Custom personal skills belong outside the managed immutable pstack tree.

<!-- covers:plugins-path -->
`~/.cursor/plugins/` and `.cursor-plugin/plugin.json` have no direct T3 plugin equivalent here. Resolve installed pstack paths through the actual skill links. Do not create Cursor or Claude plugin metadata.

<!-- covers:rules-path -->
`.cursor/rules/` and always-applied rules mean instructions supported by the current host, such as project `AGENTS.md`. Do not create or change those files merely to store model configuration. Read `pstack-models.md` explicitly.

<!-- covers:transcripts -->
`agent-transcripts` and `.cursor/projects` mean conversation history. Use `t3_thread_search`, `t3_thread_list`, and `t3_thread_read` for the relevant project. Follow pagination when necessary. Read only conversations needed for the task. Do not scan private T3 databases or unrelated project transcripts. If history tools are unavailable, use the user's context capsule or report the missing history.

<!-- covers:store -->
Cursor's agent store means a durable task directory chosen explicitly for the current project. It must be writable and available to the relevant workers. State whether it is local or committed. Do not invent a store path from a missing system-prompt field. Relative paths to bundled scripts resolve from the owning skill directory, not the current shell directory.

## Scheduling, PRs, and runtime evidence

<!-- covers:loop -->
Cursor `/loop` is not a T3 command. Continue a single autonomous task in the current thread. For explicitly requested persistent recurring work, use `schedule_task` with a structured schedule and retain the scheduled task ID for later cleanup. A request to finish one task does not authorize an indefinite recurring schedule. A webhook uses private secret entry when signature verification needs a secret.

<!-- covers:watch -->
For GitHub PR watching use `watch_pull_request`. Handle existing findings before arming it, then end the turn. Re-read checks, comments, and merge readiness when woken. A watch notification is not permission to merge. Register PRs opened by this thread with `link_pull_request`. Before handing back ownership, stop the watch with `unwatch_pull_request`. A child cannot own a T3 PR watch, so its parent handles watching.

The bundled `scripts/watch-pr/watch-pr` has an optional status-only role. Do not start its polling loop alongside a T3 watch. For a forge T3 cannot watch, use that forge's supported status commands and report the limitation.

For Orchestrate, keep the project tracker and store in an explicitly chosen writable location. Use T3 task IDs and completion notifications for child status and supported PR event tools for watches. The upstream orchestration bookkeeping script has been removed; do not invoke it. After a restart, inspect durable T3 task and thread state rather than assuming every local child died.

<!-- covers:cursor-features -->
Cursor Automations, Bugbot integration, and Cursor cloud-agent dashboards are not T3 features. For existing bot comments, verify each claim against the code. Do not fabricate a bot pass count. Map an automation to T3 scheduling only when it meets the user's request and supported trigger. Report unsupported integrations instead of claiming they ran. T3 has no built-in PR creation tool. Create PRs with the resolved forge command, then register them with `link_pull_request`.

<!-- covers:deslop -->
`deslop` from `cursor-team-kit` is not installed. Run its checklist in the current session over the diff against main, and remove the slop the branch introduced. Look for comments that are unnecessary or inconsistent with local style, defensive checks or try/catch blocks that are abnormal for trusted code paths, casts to `any` used only to bypass type issues, deep nesting that early returns would simplify, and other patterns inconsistent with the file and its surroundings. Keep behavior unchanged unless fixing a clear bug, prefer minimal focused edits, and keep the summary to one to three sentences. Do not search for the plugin on disk or the network.

<!-- covers:control -->
`control-ui` and `control-cli` mean runtime verification, and `cursor-team-kit` otherwise names plugins this installation lacks. Use available browser, terminal, and device tools. Prefer T3 `preview_*` and `device_*` when exposed. Follow tab ownership and device-control rules. A screenshot or recording must come from a real run. If required runtime access is absent, report verification as blocked rather than passed.

<!-- covers:platform -->
Statechart's bundled scripts require a compatible TypeScript runtime and may install Java and TLC using mise on first use. Follow the host's tool and authorization rules before installing dependencies or running them. Its Pele rendering instructions apply when compatible with the host's output requirements; otherwise follow the host's visual delivery rules and report any rendering limitation.

Any other Cursor-specific field or command requires a supported mapping. Report it and its source path when no mapping exists. Do not pass unknown fields, invent a substitute tool, or claim a platform feature is available.
