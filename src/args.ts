import { UsageError } from "./types";

export type Command = "tree" | "folded" | "top" | "check";

export interface HelpArgs {
  help: true;
}

export interface RunArgs {
  help: false;
  command: Command;
  file: string;
  trace?: string;
  unit: "us" | "ms";
  minTotal: number;
  limit: number;
}

const COMMANDS: readonly string[] = ["tree", "folded", "top", "check"];
const OPTIONS = ["--trace", "--unit", "--min-total", "--limit"] as const;
const NUMBER = /^(0|[1-9][0-9]*)$/;

function parseNumber(value: string, min: number, max: number): number | null {
  if (!NUMBER.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export function parseArgs(args: string[]): HelpArgs | RunArgs {
  if (args.length === 1 && args[0] === "--help") {
    return { help: true };
  }
  const command = args[0];
  if (command === undefined) {
    throw new UsageError("missing command (tree, folded, top or check)");
  }
  if (!COMMANDS.includes(command)) {
    throw new UsageError(`unknown command "${command}"`);
  }

  const values = new Map<string, string>();
  const positionals: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i] as string;
    let matched = false;
    for (const name of OPTIONS) {
      if (arg === name) {
        if (i + 1 >= args.length) {
          throw new UsageError(`${name} needs a value`);
        }
        i++;
        values.set(name, args[i] as string);
        matched = true;
        break;
      }
      if (arg.startsWith(`${name}=`)) {
        values.set(name, arg.slice(name.length + 1));
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (arg.startsWith("-") && arg !== "-") {
      throw new UsageError(`unknown option "${arg}"`);
    }
    positionals.push(arg);
  }

  const unitValue = values.get("--unit");
  if (unitValue !== undefined && unitValue !== "us" && unitValue !== "ms") {
    throw new UsageError(`invalid --unit "${unitValue}" (expected us or ms)`);
  }
  const minValue = values.get("--min-total");
  let minTotal = 0;
  if (minValue !== undefined) {
    const n = parseNumber(minValue, 0, 1000000000);
    if (n === null) {
      throw new UsageError(
        `invalid --min-total "${minValue}" (expected a whole number from 0 to 1000000000)`,
      );
    }
    minTotal = n;
  }
  const limitValue = values.get("--limit");
  let limit = 10;
  if (limitValue !== undefined) {
    const n = parseNumber(limitValue, 1, 1000000);
    if (n === null) {
      throw new UsageError(
        `invalid --limit "${limitValue}" (expected a whole number from 1 to 1000000)`,
      );
    }
    limit = n;
  }
  if (unitValue !== undefined && (command === "folded" || command === "check")) {
    throw new UsageError(`--unit is not valid for ${command}`);
  }
  if (minValue !== undefined && command !== "tree") {
    throw new UsageError("--min-total is only valid for tree");
  }
  if (limitValue !== undefined && command !== "top") {
    throw new UsageError("--limit is only valid for top");
  }
  const file = positionals[0];
  if (file === undefined) {
    throw new UsageError("missing FILE");
  }
  if (positionals.length > 1) {
    throw new UsageError("too many arguments");
  }
  const result: RunArgs = {
    help: false,
    command: command as Command,
    file,
    unit: unitValue === "ms" ? "ms" : "us",
    minTotal,
    limit,
  };
  const trace = values.get("--trace");
  if (trace !== undefined) {
    result.trace = trace;
  }
  return result;
}
