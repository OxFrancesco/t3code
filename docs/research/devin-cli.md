# Devin CLI research for a first-party t3code provider

Research date: 2026-07-29

Local CLI inspected: `devin 3000.2.17 (2c489dfc)`

Scope: the current Devin CLI integration surface, flags, models, authentication,
sessions, permissions, attachments, and the corresponding t3code provider
contracts.

## Recommendation

Implement Devin as a dedicated first-party provider whose process transport is
`devin acp`.

ACP is Devin's documented editor/IDE integration protocol: a long-running
JSON-RPC process over standard input/output. That fits t3code's existing generic
ACP runtime and gives t3code structured streaming, tool calls, permission
requests, elicitation, cancellation, session resume, model selection, and image
content without scraping a terminal UI. The interactive TUI and `devin -p`
remain useful for users, but are not suitable provider transports because their
output and lifecycle contracts are materially weaker. See Devin's
[ACP documentation](https://docs.devin.ai/cli/acp/zed) and
[CLI overview](https://docs.devin.ai/cli).

The provider should still be Devin-specific at the driver/adapter layer. Devin
has its own installation and auth probes, dynamic model catalog, modes,
configuration, session metadata, and ACP capability negotiation. Sharing the
ACP session runtime does not mean pretending every ACP agent has the same
product semantics.

## Source-of-truth policy

This research combines:

- Official Devin documentation, indexed by
  [`llms.txt`](https://docs.devin.ai/llms.txt).
- The official CLI's own help and machine-readable output from the locally
  installed stable build, version `3000.2.17`.
- t3code's provider and orchestration contracts in this repository.

Where the website and installed stable CLI disagree, the installed CLI's
parser is authoritative for the current implementation. This matters most for
permission-mode names: some documentation still describes older
`normal`/`bypass`/`autonomous` terminology, while the current stable binary
accepts `auto`, `accept-edits`, `smart`, and `dangerous`.

## Current top-level CLI

The local stable binary reports this shape:

```text
devin [OPTIONS] [-- <PROMPT>...] [COMMAND]
```

### Global flags

| Flag                                      | Current behavior                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-file <FILE>`                    | Read the initial prompt from a file.                                                                                          |
| `--config <PATH>`                         | Override the default user configuration file.                                                                                 |
| `--permission-mode <MODE>`                | Current accepted values: `auto`, `accept-edits`, `smart`, `dangerous`. Environment: `DEVIN_PERMISSION_MODE`. Default: `auto`. |
| `--sandbox`                               | Enable the Devin CLI sandbox. Environment: `DEVIN_SANDBOX`.                                                                   |
| `--model <MODEL>`                         | Select a model family alias, slug, or model UID. Environment: `DEVIN_MODEL`.                                                  |
| `-p`, `--print [<PROMPT>]`                | Run a non-interactive prompt, print the response, and exit.                                                                   |
| `--export [<PATH>]`                       | Export the conversation in ATIF after each turn.                                                                              |
| `-c`, `--continue`                        | Continue the most recent conversation.                                                                                        |
| `-r`, `--resume [<SESSION_ID>]`           | Resume a specific session, or choose one interactively when the ID is omitted.                                                |
| `--respect-workspace-trust [true\|false]` | Respect workspace trust. Current defaults are `true` interactively and `false` in print mode.                                 |
| `--agent-config <FILE>`                   | Load a strict JSON or YAML declarative agent configuration.                                                                   |
| `-h`, `--help`                            | Show help.                                                                                                                    |
| `-V`, `--version`                         | Show version.                                                                                                                 |
| `-- <PROMPT>...`                          | Pass the prompt after the option terminator.                                                                                  |

These values were verified against `devin --help` on stable `3000.2.17`. The
official documentation also covers
[configuration](https://docs.devin.ai/cli/reference/configuration/config-file),
[permissions](https://docs.devin.ai/cli/reference/permissions), and the
[sandbox](https://docs.devin.ai/cli/sandbox), but the integration should
feature-detect the installed binary rather than assume old documentation is
the parser contract.

Global launch options are accepted before the ACP subcommand, for example:

```text
devin --model <MODEL> --permission-mode <MODE> --sandbox acp
```

`--config` and `--agent-config` also belong before `acp`.

### Subcommands and flags

The following catalog was captured from each command's local `--help` on stable
`3000.2.17`.

| Area              | Commands                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication    | `auth login [--force-manual-token-flow]`, `auth logout`, `auth status`                                                                                                |
| Initial setup     | `setup [--force-manual-token-flow]`                                                                                                                                   |
| ACP               | `acp [--agent-type <summarizer\|review>]`                                                                                                                             |
| MCP               | `mcp add`, `list`, `get`, `remove`, `login`, `logout`, `enable`, `disable`                                                                                            |
| Models            | `models list [--format <text\|json>]`                                                                                                                                 |
| Rules             | `rules list [--provider <cursor\|windsurf>]`, `rules show`, `rules paths`                                                                                             |
| Skills            | `skills list [--trigger <user\|model>] [--json]`, `skills show`, `skills paths`                                                                                       |
| Plugins           | `plugins install [-y\|--yes] <SOURCE>`, `list`, `info`, `update`, `remove`, `prune`                                                                                   |
| Cloud/DRS         | `cloud whoami`, `sandbox-create`, `run`, `blueprint-list`, `blueprint-create`, `blueprint-write`, `build`, `build-start`, `build-wait`, `build-logs`, `secret-create` |
| Sessions          | `list` (alias `ls`) `[--format <interactive\|json\|csv>]`                                                                                                             |
| Maintenance       | `update [--force]`, `version`, `migrate hooks`, `migrate workflows [--scope <all\|workspace\|global>]`, `uninstall [--clean] [--force]`                               |
| Sandbox           | `sandbox setup`                                                                                                                                                       |
| Shell integration | `shell init <bash\|zsh\|fish> [--stage <pre\|post>]`, `shell run <SHELL> [--parent <PID>] [--max-history <N>]`, `shell setup [SHELL]`                                 |

The more detailed MCP add surface is:

```text
devin mcp add
  [-t|--transport <stdio|sse|http>]
  [-s|--scope <local|project|user>]
  [URL]
  [--url <URL>]
  [--command <COMMAND>]
  [-e|--env <KEY=VALUE>]...
  [-H|--header <KEY=VALUE>]...
  [--scopes <SCOPES>]
  [--oauth-client-id <ID>]
  [--oauth-client-secret <SECRET>]
  [--oauth-resource <RESOURCE>]
  [STDIO_ARGS]...
```

The default MCP scope is `local`. MCP removal, enablement, and disablement are
also scope-aware; MCP login supports OAuth client and resource options. See the
official [MCP guide](https://docs.devin.ai/cli/mcp).

Cloud/DRS command details relevant to feature parity:

- `cloud sandbox-create` accepts a repository, an optional prompt, and
  repeatable secrets.
- `cloud run` requires `--devin-id` and `--command`; timeout defaults to 600
  seconds.
- Blueprint creation can use a repository or file; blueprint writing can use
  an existing blueprint ID or file.
- `cloud build-logs` produces NDJSON.

Cloud/DRS is a separate remote execution product surface. It should not be
conflated with the local ACP provider in the first implementation.

### ACP agent types

`devin acp` starts the normal coding agent by default. Current
`--agent-type` values are:

- `summarizer`: no tools; persists summaries beneath
  `$XDG_DATA_HOME/devin/summaries/<id>.md`.
- `review`: read-only plus shell access, intended to review correctness, style,
  security, performance, and completeness.

These should be exposed only if t3code intends to offer distinct Devin agent
personas. They are launch-time process choices, not model variants.

## Models

### Discovery contract

Use:

```text
devin models list --format json
```

The result is the model source of truth for the authenticated account. A family
contains a label, family UID, slug, aliases, and variants. Variants include
model UID, label, context/output limits, cost metadata, and new/beta markers.
The available set changes frequently and may be account- or team-dependent.
The official [models documentation](https://docs.devin.ai/cli/models) likewise
describes aliases as moving references to the latest family.

Therefore:

1. Parse the JSON at runtime with a tolerant schema.
2. Offer each returned `model_uid` as an exact selectable model.
3. Preserve useful family aliases as fallback/default choices.
4. Cache the last successful inventory, but never make a checked-in catalog the
   sole source of truth.
5. If model discovery fails, retain a conservative fallback such as `adaptive`
   plus the common aliases returned by the user's last successful probe.

### Inventory observed on 2026-07-29

The authenticated local CLI returned these 37 model families. This is a
snapshot for implementation/testing, not a permanent allowlist.

| Family            | Slug / alias                                  | Observed variants                                                                            |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Claude Opus 5     | `claude-opus-5`, alias `opus`                 | `claude-opus-5-{low,medium,high,xhigh,max}` and matching `-fast` variants                    |
| Claude Fable 5    | `claude-fable-5`                              | `claude-5-fable-{low,medium,high,xhigh,max}`                                                 |
| Claude Sonnet 5   | `claude-sonnet-5`, aliases `claude`, `sonnet` | `claude-sonnet-5-{low,medium,high,xhigh,max}`                                                |
| GPT-5.6 Sol       | `gpt-5.6-sol`                                 | `gpt-5-6-sol-{none,low,medium,high,xhigh,max}` and `none` through `xhigh` priority variants  |
| GPT-5.6 Luna      | `gpt-5.6-luna`                                | `gpt-5-6-luna-{none,low,medium,high,xhigh,max}` and `none` through `xhigh` priority variants |
| GLM-5.2           | `glm-5.2`                                     | `glm-5-2`, `-max`, `-1m`, `-max-1m`, `-none`, `-none-1m`                                     |
| Kimi K3           | `kimi-k3`                                     | `kimi-k3-{low,high,max}`                                                                     |
| SWE-1.7           | `swe-1.7`                                     | `swe-1-7`, `swe-1-7-medium`                                                                  |
| SWE-1.7 Lightning | `swe-1.7-lightning`, alias `swe`              | `swe-1-7-lightning`                                                                          |
| Adaptive          | `adaptive`                                    | `adaptive`                                                                                   |
| Claude Opus 4.7   | `claude-opus-4.7`                             | low, medium, high, xhigh, max                                                                |
| Claude Opus 4.8   | `claude-opus-4.8`                             | low, medium, high, xhigh, max, plus matching fast variants                                   |
| Gemini 3.5 Flash  | `gemini-3.5-flash`                            | minimal, low, medium, high                                                                   |
| Gemini 3.6 Flash  | `gemini-3.6-flash`, alias `gemini`            | minimal, low, medium, high                                                                   |
| GPT-5.6 Terra     | `gpt-5.6-terra`, alias `gpt`                  | none, low, medium, high, xhigh, max, plus priority variants except max-priority              |
| Grok 4.5          | `grok-4.5`                                    | low, medium, high                                                                            |
| Inkling           | `inkling`                                     | none, low, medium, high, xhigh, max                                                          |
| Claude Opus 4.6   | `claude-opus-4.6`                             | base, thinking, 1m, thinking-1m                                                              |
| GPT-5.4           | `gpt-5.4`                                     | none, low, medium, high, xhigh, plus matching priority variants                              |
| GPT-5.5           | `gpt-5.5`                                     | none, low, medium, high, xhigh, plus matching priority variants                              |
| GPT-5.4 Mini      | `gpt-5.4-mini`                                | low, medium, high, xhigh                                                                     |
| Claude Sonnet 4.6 | `claude-sonnet-4.6`                           | base, thinking, 1m, thinking-1m                                                              |
| GPT-5.2           | `gpt-5.2`                                     | `MODEL_GPT_5_2_{NONE,LOW,MEDIUM,HIGH,XHIGH}`                                                 |
| Claude Opus 4.5   | `claude-opus-4.5`                             | `MODEL_CLAUDE_4_5_OPUS`, `_THINKING`                                                         |
| Claude Haiku 4.5  | `claude-haiku-4.5`, alias `haiku`             | `MODEL_PRIVATE_11`                                                                           |
| Claude Sonnet 4.5 | `claude-sonnet-4.5`                           | `MODEL_PRIVATE_2`, `MODEL_PRIVATE_3`                                                         |
| GPT-4.1           | `gpt-4.1`                                     | `MODEL_CHAT_GPT_4_1_2025_04_14`                                                              |
| GPT-5.1           | `gpt-5.1`                                     | `MODEL_PRIVATE_12` through `MODEL_PRIVATE_15`                                                |
| GPT-5.3-Codex     | `gpt-5.3-codex`, alias `codex`                | low, medium, high, xhigh, plus matching priority variants                                    |
| Kimi K2.6         | `kimi-k2.6`                                   | `kimi-k2-6`                                                                                  |
| Kimi K2.7         | `kimi-k2.7`                                   | `kimi-k2-7`                                                                                  |
| Nemotron 3 Ultra  | `nemotron-3-ultra`                            | `nemotron-3-ultra-nvfp4`                                                                     |
| SWE-1.6           | `swe-1.6`                                     | `swe-1-6`                                                                                    |
| SWE-1.6 Fast      | `swe-1.6-fast`                                | `swe-1-6-fast`                                                                               |
| Gemini 3.1 Pro    | `gemini-3.1-pro`                              | low, high                                                                                    |
| Gemini 3 Flash    | `gemini-3-flash`                              | `MODEL_GOOGLE_GEMINI_3_0_FLASH_{MINIMAL,LOW,MEDIUM,HIGH}`                                    |
| DeepSeek V4 Pro   | `deepseek-v4-pro`                             | `deepseek-v4`                                                                                |

Current observed aliases are `opus`, `claude`, `sonnet`, `swe`, `gemini`,
`gpt`, `haiku`, and `codex`.

## Sessions, output, and exit behavior

Devin supports several user-facing execution shapes:

- Interactive TUI: `devin -- <prompt>`.
- One-shot output: `devin -p "<prompt>"`.
- Prompt file: `devin --prompt-file <path>`.
- Continue latest: `devin -c`.
- Resume by session: `devin -r <session-id>`.
- ATIF export: `devin --export [path]`.
- Session inventory: `devin list --format interactive|json|csv`.
- Structured editor process: `devin acp`.

Interactive sessions can exit with `/exit`, `/quit`, plain `exit`/`quit`, and
can cancel work with Ctrl+C. See
[essential commands](https://docs.devin.ai/cli/essential-commands) and the
[command reference](https://docs.devin.ai/cli/reference/commands).

The print command has no documented JSON/JSONL event stream. Its buffering and
chunking contract is not published, so it should not be used to drive t3code
chat events. The stable changelog notes that a maximum-token-truncated piped
response warns and exits nonzero, but there is no comprehensive published
numeric exit-code table. Locally, `--version` exits `0` and parser errors exit
`2`. Treat every nonzero process exit as a typed provider failure and retain
stderr rather than depending on undocumented numeric meanings. See the
[stable changelog](https://docs.devin.ai/cli/changelog/stable).

ACP is the only documented local surface that supplies the structured,
long-running semantics t3code needs.

## Authentication and environment

### Local CLI authentication

Supported commands:

```text
devin auth login
devin auth status
devin auth logout
```

`login` and `setup` support `--force-manual-token-flow`. Devin documents
persistent credentials in:

- `$XDG_DATA_HOME/devin/credentials.toml`, or
  `~/.local/share/devin/credentials.toml` on macOS/Linux.
- `%APPDATA%\devin\credentials.toml` on Windows.

Tokens are documented as persistent/non-expiring by default; logout removes
the stored credential. Enterprise teams must grant the "Use Devin CLI" RBAC
permission. See
[Devin authentication](https://docs.devin.ai/cli/enterprise/devin-auth) and
the [legacy Windsurf authentication page](https://docs.devin.ai/cli/enterprise/windsurf-auth).

The ACP documentation says the process reads `WINDSURF_API_KEY` when set and
otherwise uses stored credentials, with ACP authentication available at
runtime. An older changelog note says ACP hosts must provide credentials. The
provider must therefore negotiate the actual ACP authentication methods
returned by the installed version instead of hardcoding a method ID.

`DEVIN_API_KEY` belongs to Devin's cloud REST API documentation; it is not a
documented substitute for local CLI login.

### Relevant environment variables

| Variable                                             | Purpose                                              |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `DEVIN_MODEL`                                        | Default model                                        |
| `DEVIN_PERMISSION_MODE`                              | Default permission mode                              |
| `DEVIN_SANDBOX`                                      | Enable sandbox behavior                              |
| `WINDSURF_API_KEY`                                   | Credential source documented for ACP compatibility   |
| `XDG_DATA_HOME`                                      | Credentials, summaries, and other user data location |
| `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` | Proxy routing                                        |
| `NO_COLOR`                                           | Disable colored terminal output                      |

The provider process should inherit the user's normal credential and proxy
environment, while ensuring secrets are never copied into logs or persisted
inside t3code session snapshots.

## Permissions and sandbox

### Permission modes

Current stable parser values are:

| Mode           | Integration meaning                                                           |
| -------------- | ----------------------------------------------------------------------------- |
| `auto`         | Default Devin decision behavior                                               |
| `accept-edits` | Automatically accept edit-oriented actions                                    |
| `smart`        | Use Devin's smart permission behavior                                         |
| `dangerous`    | Broadly bypass safety prompts; must be clearly marked and explicitly selected |

Do not translate the website's stale `normal`, `bypass`, or `autonomous` labels
directly into launch arguments. Probe `devin --help`, constrain saved settings
to values accepted by the installed binary, and fail with a clear compatibility
message when a requested mode is unavailable.

Devin permission rules support:

- `Read(glob)`
- `Write(glob)`
- `Exec(prefix)`
- `Fetch(pattern)`
- tool names such as `read`, `edit`, `grep`, `glob`, `exec`
- MCP tools such as `mcp__server__tool`, server wildcards, and all-tool rules

Precedence is organization, session, local project, project, then user. Within
a rule set, `deny` wins over `ask`, which wins over `allow`. See the official
[permissions reference](https://docs.devin.ai/cli/reference/permissions).

### Sandbox

Devin's sandbox uses:

- macOS Seatbelt.
- Linux/WSL `bubblewrap` plus `socat`.
- No native Windows support.

It is documented as fail-closed and supports path scopes, excluded commands,
and optional/unstable domain filtering. See the official
[sandbox guide](https://docs.devin.ai/cli/sandbox).

t3code should keep its approval policy and runtime sandbox selection distinct:
ACP permission callbacks govern per-operation approval, while `--sandbox`
changes OS-level process enforcement.

## Attachments and context

The interactive CLI supports `@` file/directory autocomplete and clipboard
image paste with Ctrl+V. The changelog documents ACP image support, including
JPEG, PNG, GIF, and WebP; BMP, TIFF, and ICO are transcoded to PNG, and
undecodable images larger than 5 MB can be dropped. Image support also depends
on the selected model. See
[essential commands](https://docs.devin.ai/cli/essential-commands) and the
[stable changelog](https://docs.devin.ai/cli/changelog/stable).

There is no documented top-level `--file`, `--attachment`, or `--image` flag
for `devin -p`, and Devin Cloud's REST `ATTACHMENT` syntax must not be assumed
to work in the local CLI.

ACP capability negotiation is the correct path:

- Send t3code image attachments as base64 ACP image content only when the
  initialize response advertises image prompt capability.
- Use resource links or embedded context only when negotiated.
- t3code's current `ChatAttachment` contract is image-only, so first-class
  arbitrary file attachments require a separate contract/UI expansion.

## Devin feature surface beyond chat

First-party parity should account for these Devin concepts even when they map
to existing t3code primitives:

- `AGENTS.md` and rules:
  [rules](https://docs.devin.ai/cli/rules).
- Reusable skills:
  [skills](https://docs.devin.ai/cli/skills).
- Plugins:
  [plugins](https://docs.devin.ai/cli/plugins).
- Hooks:
  [hooks](https://docs.devin.ai/cli/hooks).
- Subagents:
  [subagents](https://docs.devin.ai/cli/subagents).
- MCP servers and OAuth:
  [MCP](https://docs.devin.ai/cli/mcp).
- Handoff between local and cloud Devin:
  [handoff](https://docs.devin.ai/cli/handoff).
- Shell integration and session context:
  [essential commands](https://docs.devin.ai/cli/essential-commands).

These do not all require dedicated UI in the first patch. They do require that
the provider avoid disabling or corrupting Devin's native configuration and
that capability discovery accurately reflects what can be used inside a t3code
session.

## Mapping to t3code

The repository already has the right core architecture:

- [`ProviderDriver.ts`](../../apps/server/src/provider/ProviderDriver.ts)
  defines a provider snapshot, adapter, text-generation service, and instance
  support.
- [`AcpSessionRuntime.ts`](../../apps/server/src/provider/acp/AcpSessionRuntime.ts)
  implements ACP initialize/authenticate/new/load/resume, prompt/cancel,
  model/config/mode selection, permissions, elicitation, filesystem and
  terminal callbacks, and event streaming.
- [`CursorAcpSupport.ts`](../../apps/server/src/provider/acp/CursorAcpSupport.ts)
  and
  [`GrokAcpSupport.ts`](../../apps/server/src/provider/acp/GrokAcpSupport.ts)
  show provider-specific ACP process construction.
- [`CursorAdapter.ts`](../../apps/server/src/provider/Layers/CursorAdapter.ts)
  and
  [`GrokAdapter.ts`](../../apps/server/src/provider/Layers/GrokAdapter.ts)
  show how ACP events become t3code's canonical event stream.
- [`provider.ts`](../../packages/contracts/src/provider.ts) defines start,
  turn, resume, approval, sandbox, runtime-mode, model-selection, and
  attachment inputs.
- [`server.ts`](../../packages/contracts/src/server.ts) defines provider health,
  authentication, models, slash commands, skills, and update metadata.

### Capability matrix

| Devin capability                | Devin surface                               | t3code mapping                       | Required implementation                                         |
| ------------------------------- | ------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Long-running chat               | `devin acp`                                 | Generic ACP runtime                  | Dedicated Devin process support                                 |
| Streaming text/tool calls/plans | ACP session updates                         | Canonical provider events            | Devin adapter normalization and tests                           |
| Permissions                     | ACP permission requests + Devin rules       | Approval requests/responses          | Preserve allow/deny/ask choices and cancellation                |
| Structured questions            | ACP elicitation                             | t3code user-input request            | Reuse runtime callback path                                     |
| Resume                          | ACP load/resume/session ID                  | Resume cursor                        | Versioned Devin cursor schema                                   |
| Interrupt                       | ACP cancel                                  | Provider interrupt                   | Wire cancel and verify post-cancel health                       |
| Model discovery                 | `models list --format json`                 | Provider model inventory             | Dynamic parser, caching, fallback                               |
| Session model                   | ACP model/config option or launch `--model` | Start/turn model selection           | Capability-detect live model switch; restart only when required |
| Runtime/persona                 | ACP modes/config, `--agent-type`            | Runtime/interaction mode             | Negotiate modes; expose personas separately                     |
| Images                          | ACP image content                           | Existing image attachment            | Gate on negotiated capability                                   |
| Arbitrary files                 | ACP resources/context                       | Not in current attachment union      | Separate contracts/UI work                                      |
| Local auth                      | `auth status`, ACP auth methods             | Provider auth snapshot               | Non-mutating status probe and negotiated login flow             |
| Installation/version            | `devin --version`                           | Provider health                      | Binary path setting, timeout, parsed version                    |
| Sandbox                         | `--sandbox`                                 | Sandbox selection                    | Launch-time mapping                                             |
| Permission preset               | `--permission-mode`                         | Approval/runtime policy              | Explicit compatible mapping; do not silently broaden            |
| MCP                             | Native config plus ACP host MCP descriptors | t3code MCP bridge                    | Avoid duplicate servers and preserve auth                       |
| Text generation                 | Same provider/model                         | Commit, PR, branch, title helpers    | Add Devin text-generation provider implementation               |
| Cloud/DRS                       | `devin cloud ...`                           | No current local-provider equivalent | Keep out of initial ACP transport; consider later feature       |

## Concrete implementation requirements

1. Add a `devin` provider identity to shared contracts, built-in driver
   registration, environment/provider-instance unions, provider metadata,
   settings, picker, icons, and provider-specific documentation.
2. Create a dedicated Devin driver and adapter while reusing
   `AcpSessionRuntime`.
3. Spawn:

   ```text
   <configured binary or devin>
     [--config <path>]
     [--agent-config <path>]
     [--model <uid-or-alias>]
     [--permission-mode <mode>]
     [--sandbox]
     acp
     [--agent-type <summarizer|review>]
   ```

   Only include explicitly configured options. Never infer `dangerous`.

4. Probe installation with `devin --version` and authentication with the
   read-only `devin auth status`. Apply bounded timeouts and preserve actionable
   stderr.
5. Discover models dynamically with
   `devin models list --format json`. Tolerate new fields and families while
   validating the fields t3code consumes.
6. During ACP initialize, inspect advertised authentication methods, prompt
   capabilities, session capabilities, modes, and config options. Select only
   capabilities the process actually advertises.
7. Initialize with the requested working directory and t3code MCP descriptors.
   Detect and avoid duplicating servers already configured natively in Devin.
8. Persist a versioned resume cursor containing the Devin ACP session ID and
   any provider-specific metadata needed to reconnect.
9. Normalize assistant chunks, plans, tool calls, permission requests,
   elicitation, usage, errors, and unexpected process exits into canonical
   events. Preserve replay/drain behavior used by other providers.
10. Support interrupt, stop, approval response, user-input response, and
    session resume with integration tests against a fake ACP peer plus an
    optional real-CLI smoke test.
11. Implement Devin-backed text generation for commit messages, PR text,
    branch names, and thread titles so selecting Devin does not silently route
    these features through another provider.
12. Treat images as negotiated ACP content. Do not claim generic file
    attachment support until t3code's shared attachment contract supports it.
13. Add compatibility tests for current flags and permission modes, plus model
    fixtures containing unknown/new fields to prevent catalog churn from
    breaking the provider.

## Known unknowns to verify during implementation

1. **ACP authentication method IDs.** Documentation is inconsistent across
   versions. Read the initialize response and negotiate; do not invent a fixed
   method string.
2. **ACP model/mode option names.** Inspect runtime capabilities and config
   options. `--model` is a safe launch fallback, but live switching must be
   advertised.
3. **Resume portability.** Confirm whether a session created by ACP appears in
   `devin list`, and whether ACP resume IDs remain valid after CLI upgrades.
4. **Image limits over ACP.** Verify capability reporting and error behavior for
   unsupported models and oversized data.
5. **Config isolation.** A research launch with an empty override still loaded
   user-configured MCP integrations, indicating that `--config` may merge with
   imported/default configuration rather than fully isolate it. Real-CLI tests
   must use an explicitly isolated data/config environment and must not assume
   `--config {}` disables inherited integrations.
6. **Exit codes.** Numeric meanings beyond normal success and parser failure
   are undocumented; integration errors should be classified from ACP/process
   context and stderr, not magic numbers.

No further live ACP handshake was performed during this research because the
installed user's configuration initialized external MCP integrations. The
implementation can safely cover protocol behavior with a fake peer first, then
run a narrowly isolated, explicitly authorized real-CLI smoke test.

## Primary sources

- [Official CLI overview](https://docs.devin.ai/cli)
- [Command reference](https://docs.devin.ai/cli/reference/commands)
- [Models](https://docs.devin.ai/cli/models)
- [Configuration file](https://docs.devin.ai/cli/reference/configuration/config-file)
- [Permissions](https://docs.devin.ai/cli/reference/permissions)
- [Sandbox](https://docs.devin.ai/cli/sandbox)
- [Authentication](https://docs.devin.ai/cli/enterprise/devin-auth)
- [ACP with Zed](https://docs.devin.ai/cli/acp/zed)
- [ACP with JetBrains](https://docs.devin.ai/cli/acp/jetbrains)
- [ACP with Xcode](https://docs.devin.ai/cli/acp/xcode)
- [Essential commands](https://docs.devin.ai/cli/essential-commands)
- [Stable changelog](https://docs.devin.ai/cli/changelog/stable)
- Local official binary help and JSON model inventory from
  `devin 3000.2.17 (2c489dfc)`, inspected on 2026-07-29
