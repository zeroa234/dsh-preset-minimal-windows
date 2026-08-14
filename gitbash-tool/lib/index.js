// Git Bash execution tool for dsh on Windows.
//
// Modeled on @deepseek-ai/dsh-tool-pwsh (cordis tool-plugin shape) and
// @deepseek-ai/dsh-bash-local (ctx.subprocess spawn mechanics), but
// self-contained: the shipped dsh-tool-bash + dsh-bash-sandbox are disabled on
// win32 by the standard agent preset, so this plugin spawns Git Bash
// (bash.exe) directly through the ctx.subprocess seam. It imports only node
// builtins, so the linked @dsh-external package needs no harness packages to
// resolve at runtime.

import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const name = "tool-gitbash";

const inject = ["tools", "subprocess", "shellEnv"];

/** Well-known Git for Windows bash locations, probed in order. */
const BASH_CANDIDATES = [
	"C:\\Program Files\\Git\\bin\\bash.exe",
	"C:\\Program Files\\Git\\usr\\bin\\bash.exe",
	"C:\\Program Files (x86)\\Git\\bin\\bash.exe",
	"C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe"
];

/** The same model-friendly overrides dsh-bash-local applies to its spawns. */
const ENV_OVERRIDES = { NO_COLOR: "1", TERM: "dumb", PAGER: "cat", GIT_PAGER: "cat" };

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TIMEOUT_MS = 600000;
const MAX_OUTPUT_BYTES = 65536;
const MAX_SPILL_BYTES = 64 * 1024 * 1024;
const GRACE_MS = 3000;

/** Resolve the bash executable: explicit config, well-known installs, then PATH. */
function resolveBashPath(config) {
	if (typeof config?.bashPath === "string" && config.bashPath.trim().length > 0) return config.bashPath;
	for (const candidate of BASH_CANDIDATES) {
		if (existsSync(candidate)) return candidate;
	}
	return "bash";
}

function validateArgs(args) {
	if (typeof args.command !== "string" || args.command.trim().length === 0) {
		throw new Error("invalid command: expected a non-empty string");
	}
	if (typeof args.description !== "string" || args.description.trim().length === 0) {
		throw new Error("invalid description: expected a non-empty string");
	}
	if (args.timeoutMs !== void 0 && (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0)) {
		throw new Error(`invalid timeoutMs: expected a positive number, got ${JSON.stringify(args.timeoutMs)}`);
	}
}

/** Explicit workdir first (session-workspace-relative), else the session header cwd. */
function resolveWorkdir(modelWorkdir, exec) {
	const headerCwd = exec.agent?.session.header.cwd;
	if (modelWorkdir === void 0) return headerCwd;
	if (headerCwd !== void 0 && !isAbsolute(modelWorkdir)) return resolve(headerCwd, modelWorkdir);
	return modelWorkdir;
}

/** Project a settled collect-mode reader into the final output shape (mirrors dsh-bash-local). */
function finalOutput(reader) {
	const read = reader.readFrom(0);
	return {
		text: read.text,
		truncated: read.lossy,
		...(read.spillPath !== void 0 ? { spillPath: read.spillPath } : {})
	};
}

/** Append the truncation notice (with the spill path) to a stream's text. */
function streamText(output) {
	if (!output.truncated) return output.text;
	return `${output.text}\n[output truncated; full output: ${output.spillPath ?? "(unavailable)"}]`;
}

/** Shape one finished run into the text the model sees (mirrors the pwsh tool's renderer). */
function renderResult(value) {
	const out = streamText(value.stdout);
	const err = streamText(value.stderr);
	let body = out;
	if (err.length > 0) {
		if (body.length > 0 && !body.endsWith("\n")) body += "\n";
		body += `[stderr]\n${err}`;
	}
	if (body.length === 0) body = "(no output)";
	const markers = [];
	if (value.timedOut) markers.push(`[timed out after ${value.timeoutMs}ms]`);
	if (value.signal !== null) markers.push(`[killed by signal: ${value.signal}]`);
	else if (value.exitCode !== 0) markers.push(`[exit code: ${value.exitCode}]`);
	if (markers.length === 0) return body;
	if (!body.endsWith("\n")) body += "\n";
	return body + markers.join("\n");
}

/** Minimal parse of the marker tail appended by renderResult, for terminal-card presentation. */
function parseExitStatus(text) {
	const body = text.replace(/\n\[(exit code|killed by signal|timed out)[^\n]*\]/g, "").replace(/\n+$/, "");
	const exitCode = text.match(/\[exit code: (\d+)\]/);
	const signal = text.match(/\[killed by signal: ([^\]]+)\]/);
	const timedOut = text.match(/\[timed out after (\d+)ms\]/);
	return {
		body,
		...(exitCode !== null ? { exitCode: Number(exitCode[1]) } : {}),
		...(signal !== null ? { signal: signal[1] } : {}),
		...(timedOut !== null ? { timedOut: true, timeoutMs: Number(timedOut[1]) } : {})
	};
}

const toolDescription = [
	"Execute a bash command in Git Bash (`bash -c`) and return its stdout/stderr.",
	"Each call runs in a fresh bash process: no state (cwd, variables, functions) persists between calls — pass `workdir` instead of using `cd`.",
	"Inside bash use POSIX paths (forward slashes); Windows paths like `C:/...` also work.",
	"Non-zero exits are reported as `[exit code: N]` markers; investigate failures before moving on.",
	"Long output is truncated to its tail; the full output is saved to a file whose path is reported when available."
].join(" ");

function apply(ctx, config = {}) {
	const bashPath = resolveBashPath(config);
	ctx.tools.register({
		name: "gitbash",
		description: toolDescription,
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				command: {
					type: "string",
					description: "The bash command to execute in Git Bash."
				},
				description: {
					type: "string",
					description: "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"."
				},
				timeoutMs: {
					type: "number",
					description: "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
				},
				workdir: {
					type: "string",
					description: "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
				}
			},
			required: ["command", "description"]
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kind: { type: "string", const: "foreground" },
					exitCode: { oneOf: [{ type: "integer" }, { type: "null" }] },
					signal: { oneOf: [{ type: "string" }, { type: "null" }] },
					timedOut: { type: "boolean" },
					aborted: { type: "boolean" },
					timeoutMs: { type: "number" },
					stdout: {
						type: "object",
						additionalProperties: false,
						properties: {
							text: { type: "string" },
							truncated: { type: "boolean" },
							spillPath: { type: "string" }
						}
					},
					stderr: {
						type: "object",
						additionalProperties: false,
						properties: {
							text: { type: "string" },
							truncated: { type: "boolean" },
							spillPath: { type: "string" }
						}
					}
				}
			},
			render: (_args, value) => [{ type: "text", text: renderResult(value) }]
		},
		async execute(args, exec) {
			validateArgs(args);
			const workdir = resolveWorkdir(args.workdir, exec);
			const timeoutMs = Math.min(args.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
			const ac = new AbortController();
			let timedOut = false;
			const timer = setTimeout(() => {
				timedOut = true;
				ac.abort();
			}, timeoutMs);
			exec.signal?.addEventListener("abort", () => ac.abort(), { once: true });
			try {
				const handle = ctx.subprocess.spawn({
					argv: [bashPath, "-c", args.command],
					cwd: workdir ?? process.cwd(),
					stdio: {
						stdin: "ignore",
						stdout: { maxBytes: MAX_OUTPUT_BYTES, spill: { maxBytes: MAX_SPILL_BYTES } },
						stderr: { maxBytes: MAX_OUTPUT_BYTES, spill: { maxBytes: MAX_SPILL_BYTES } }
					},
					graceMs: GRACE_MS,
					signal: ac.signal,
					env: { ...ENV_OVERRIDES, ...ctx.shellEnv.collect(exec) }
				});
				const outcome = await handle.done;
				return {
					kind: "foreground",
					exitCode: outcome.exitCode,
					signal: outcome.signal,
					timedOut,
					aborted: !timedOut && exec.signal?.aborted === true,
					timeoutMs,
					stdout: finalOutput(handle.collected.stdout),
					stderr: finalOutput(handle.collected.stderr)
				};
			} catch (error) {
				throw new Error(`gitbash: ${String(error?.message ?? error)}`);
			} finally {
				clearTimeout(timer);
			}
		},
		presentCall: (args) => ({
			card: "terminal",
			title: args.command,
			description: args.description,
			...(args.workdir !== void 0 ? { cwd: args.workdir } : {})
		}),
		presentResult: (_args, result) => {
			const block = result.content.length === 1 ? result.content[0] : void 0;
			if (block === void 0 || block.type !== "text") return void 0;
			const { body, ...exit } = parseExitStatus(block.text);
			return { card: "terminal", output: body, ...exit };
		}
	});
}

export { apply, inject, name };
