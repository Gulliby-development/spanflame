import { parseArgs } from "./args";
import { renderFolded } from "./folded";
import { buildForest } from "./forest";
import { parseSpans } from "./records";
import { displayPath, escapeText, plural } from "./text";
import { renderTop } from "./top";
import { renderTree } from "./tree-view";
import { InputError, type Problem, UsageError } from "./types";

export interface Io {
  readStdin(): Uint8Array;
  readFile(path: string): Uint8Array;
  out(text: string): void;
  err(text: string): void;
}

const USAGE = [
  "usage: spanflame tree [--trace ID] [--unit us|ms] [--min-total N] [--max-depth N] FILE",
  "       spanflame folded [--trace ID] FILE",
  "       spanflame top [--trace ID] [--unit us|ms] [--limit N] FILE",
  "       spanflame check [--trace ID] FILE",
]
  .map((line) => `${line}\n`)
  .join("");

function execute(args: string[], io: Io): number {
  const parsed = parseArgs(args);
  if (parsed.help) {
    io.out(USAGE);
    return 0;
  }
  const display = displayPath(parsed.file);
  let bytes: Uint8Array;
  try {
    bytes = parsed.file === "-" ? io.readStdin() : io.readFile(parsed.file);
  } catch {
    throw new InputError(`${display}: cannot read the file`);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new InputError(`${display}: input is not valid UTF-8`);
  }
  const spans = parseSpans(text, display);
  if (spans.length === 0) {
    throw new InputError(`${display}: no spans`);
  }
  let traces = buildForest(spans);
  if (parsed.trace !== undefined) {
    const wanted = parsed.trace;
    traces = traces.filter((t) => t.id === wanted);
    if (traces.length === 0) {
      throw new InputError(`${display}: no spans for trace "${escapeText(wanted)}"`);
    }
  }
  const problems: Problem[] = traces.flatMap((t) => t.problems);
  problems.sort((a, b) => a.line - b.line);
  const lineOf = (p: Problem): string => `${display}:${p.line}: ${p.code} ${p.message}`;

  if (parsed.command === "check") {
    if (problems.length > 0) {
      io.out(problems.map((p) => `${lineOf(p)}\n`).join(""));
      return 1;
    }
    const shown = traces.reduce((sum, t) => sum + t.shown, 0);
    io.out(`${display}: ok, ${plural(shown, "span")} in ${plural(traces.length, "trace")}\n`);
    return 0;
  }

  if (problems.length > 0) {
    io.err(problems.map((p) => `spanflame: warning: ${lineOf(p)}\n`).join(""));
  }
  let view: string;
  if (parsed.command === "tree") {
    view = renderTree(traces, {
      unit: parsed.unit,
      minTotal: parsed.minTotal,
      maxDepth: parsed.maxDepth,
    });
  } else if (parsed.command === "folded") {
    view = renderFolded(traces);
  } else {
    view = renderTop(traces, { unit: parsed.unit, limit: parsed.limit });
  }
  if (view.length > 0) {
    io.out(view);
  }
  return 0;
}

export function run(args: string[], io: Io): number {
  try {
    return execute(args, io);
  } catch (error) {
    if (error instanceof UsageError || error instanceof InputError) {
      io.err(`spanflame: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}
