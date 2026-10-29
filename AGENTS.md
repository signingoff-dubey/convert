# AGENTS.md — Rules for the AI agent building Convert

Read this file first, every session. Then read `README.md` and `docs/` in numeric order.

## Working pattern: audit first

1. **Read and report before touching anything.** Phase 0 produces `docs/AUDIT.md` and nothing else. Wait for the human to reply `proceed`.
2. After that, work one phase at a time (`docs/06-BUILD-PLAN.md`). At the end of each phase: run the acceptance checks, write a short report in `docs/PROGRESS.md`, commit, then stop and wait for `continue`.
3. Do not start the next phase early.

## Decisions are already made

The specs contain decisions on stack, defaults, UX, and scope. Do not re-open them for taste. If something is **technically impossible or unsafe**, do this instead:

- Say so in `docs/DECISIONS.md` as `DEVIATION-n: what, why, evidence, what I did instead`.
- Pick the contingency named in the spec if one exists.
- Keep going. Only stop and ask if the deviation changes the product (for example, the drop-onto-overlay approach fails and no contingency works).

## Hard rules

- **Environment:** Windows 10 22H2 or Windows 11, x64. If you're running on Linux, WSL, or a container, say so in the audit and stop. Hooks and drag-and-drop can't be verified there.
- **Offline guarantee:** no network calls from the shipped app. No telemetry, no analytics, no update pings in v1. CSP must block all remote origins. Add a test that greps the bundle for `http://` and `https://` outside an allowlist (docs links only).
- **Never delete or move a user's source file** unless the user explicitly chose the Move action or enabled "send original to Recycle Bin" in Settings. Every conversion test must assert that the source file still exists afterwards.
- **Security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` in every renderer. All Node access goes through the preload with a typed, allowlisted IPC surface. Validate every IPC payload with zod.
- **No copied assets.** Don't use Tangerine's name, icons, copy, or screenshots. Draw all icons yourself (SVG) or use an MIT or ISC icon set such as `lucide-react`.
- **Licenses:** before adding any dependency, check its license. No AGPL or GPL code is linked into the app. ffmpeg must be an LGPL build, or be invoked as a separate bundled executable. Record every dependency and license in `docs/LICENSES.md`.
- **Versions:** don't pin versions from memory. Use the latest stable at audit time and record them in `docs/AUDIT.md`.
- **Quality bar:** TypeScript `strict`, no `any` (use `unknown` and narrow). ESLint and Prettier clean. Pure logic (key combos, conflict checks, state machine, filename collisions, format maps) must have unit tests (Vitest).
- **Performance budget:** idle CPU under 1%, idle RAM under 150 MB total across all Electron processes with no settings window open, wheel visible under 80 ms after the combo key.
- **Commits:** one commit per logical step, imperative messages. No force pushes.

## Style

- Folder layout and module names come from `docs/02-ARCHITECTURE.md`. Don't invent a different layout.
- UI strings live in `src/shared/strings.ts` (English only in v1, but keep them out of components).
- Prefer small pure functions. Anything that touches Win32 sits behind an interface in `src/main/native/` so it can be mocked.

## When unsure

Choose the safer option (don't delete, don't suppress keys, don't elevate) and log it in `docs/DECISIONS.md`.
