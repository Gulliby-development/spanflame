import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/args";
import { UsageError } from "../src/types";

function fail(args: string[]): string {
  try {
    parseArgs(args);
  } catch (e) {
    if (e instanceof UsageError) return e.message;
    throw e;
  }
  throw new Error("expected a UsageError");
}

describe("help", () => {
  test("--help alone", () => {
    expect(parseArgs(["--help"])).toEqual({ help: true });
  });

  test("--help first but not alone is an unknown command", () => {
    expect(fail(["--help", "tree"])).toBe('unknown command "--help"');
  });

  test("--help after a command is an unknown option", () => {
    expect(fail(["tree", "--help", "f"])).toBe('unknown option "--help"');
    expect(fail(["tree", "f", "--help"])).toBe('unknown option "--help"');
  });
});

describe("defaults and commands", () => {
  test("defaults for tree", () => {
    expect(parseArgs(["tree", "f.jsonl"])).toEqual({
      help: false,
      command: "tree",
      file: "f.jsonl",
      unit: "us",
      minTotal: 0,
      limit: 10,
    });
  });

  test("all four commands are accepted", () => {
    for (const command of ["tree", "folded", "top", "check"]) {
      const r = parseArgs([command, "f"]);
      expect(r).toMatchObject({ help: false, command, file: "f" });
    }
  });

  test("dash is a positional file", () => {
    expect(parseArgs(["tree", "-"])).toMatchObject({ file: "-" });
  });
});

describe("options", () => {
  test("--trace in both spellings", () => {
    expect(parseArgs(["tree", "--trace", "t2", "f"])).toMatchObject({ trace: "t2", file: "f" });
    expect(parseArgs(["tree", "--trace=t2", "f"])).toMatchObject({ trace: "t2", file: "f" });
  });

  test("--unit in both spellings", () => {
    expect(parseArgs(["tree", "--unit", "ms", "f"])).toMatchObject({ unit: "ms" });
    expect(parseArgs(["top", "--unit=ms", "f"])).toMatchObject({ unit: "ms" });
    expect(parseArgs(["top", "--unit=us", "f"])).toMatchObject({ unit: "us" });
  });

  test("--min-total in both spellings", () => {
    expect(parseArgs(["tree", "--min-total", "500", "f"])).toMatchObject({ minTotal: 500 });
    expect(parseArgs(["tree", "--min-total=500", "f"])).toMatchObject({ minTotal: 500 });
  });

  test("--limit in both spellings", () => {
    expect(parseArgs(["top", "--limit", "2", "f"])).toMatchObject({ limit: 2 });
    expect(parseArgs(["top", "--limit=2", "f"])).toMatchObject({ limit: 2 });
  });

  test("a value starting with a dash is taken", () => {
    expect(parseArgs(["tree", "--trace", "-x", "f"])).toMatchObject({ trace: "-x", file: "f" });
    expect(parseArgs(["tree", "--trace", "--unit", "f"])).toMatchObject({
      trace: "--unit",
      unit: "us",
      file: "f",
    });
    expect(parseArgs(["tree", "--trace=-x", "f"])).toMatchObject({ trace: "-x" });
  });

  test("the last occurrence wins", () => {
    expect(parseArgs(["tree", "--trace", "t1", "--trace", "t2", "f"])).toMatchObject({
      trace: "t2",
    });
    expect(parseArgs(["tree", "--trace=t1", "--trace", "t2", "f"])).toMatchObject({ trace: "t2" });
    expect(parseArgs(["tree", "--unit", "ms", "--unit=us", "f"])).toMatchObject({ unit: "us" });
  });

  test("an option without a value at the end", () => {
    expect(fail(["tree", "f", "--trace"])).toBe("--trace needs a value");
    expect(fail(["tree", "f", "--unit"])).toBe("--unit needs a value");
    expect(fail(["tree", "f", "--min-total"])).toBe("--min-total needs a value");
    expect(fail(["top", "f", "--limit"])).toBe("--limit needs a value");
  });

  test("unknown options", () => {
    expect(fail(["tree", "-z", "f"])).toBe('unknown option "-z"');
    expect(fail(["tree", "--bogus=1", "f"])).toBe('unknown option "--bogus=1"');
    expect(fail(["tree", "--trace2", "f"])).toBe('unknown option "--trace2"');
  });
});

describe("usage errors", () => {
  test("missing and unknown command", () => {
    expect(fail([])).toBe("missing command (tree, folded, top or check)");
    expect(fail(["run", "--bogus"])).toBe('unknown command "run"');
    expect(fail(["-"])).toBe('unknown command "-"');
  });

  test("invalid unit", () => {
    expect(fail(["tree", "--unit", "s", "f"])).toBe('invalid --unit "s" (expected us or ms)');
    expect(fail(["tree", "--unit", "", "f"])).toBe('invalid --unit "" (expected us or ms)');
  });

  test("invalid numbers are checked before option combinations", () => {
    expect(fail(["top", "--limit", "0", "--unit", "s"])).toBe(
      'invalid --unit "s" (expected us or ms)',
    );
    expect(fail(["tree", "--min-total", "01", "--limit", "x"])).toBe(
      'invalid --min-total "01" (expected a whole number from 0 to 1000000000)',
    );
    expect(fail(["folded", "--limit", "0", "--unit", "ms"])).toBe(
      'invalid --limit "0" (expected a whole number from 1 to 1000000)',
    );
  });

  test("option combinations in order", () => {
    expect(fail(["folded", "--unit", "ms", "--limit", "2", "f"])).toBe(
      "--unit is not valid for folded",
    );
    expect(fail(["check", "--unit", "us", "f"])).toBe("--unit is not valid for check");
    expect(fail(["top", "--min-total", "5", "--limit", "2"])).toBe(
      "--min-total is only valid for tree",
    );
    expect(fail(["folded", "--min-total", "5", "f"])).toBe("--min-total is only valid for tree");
    expect(fail(["tree", "--limit", "5"])).toBe("--limit is only valid for top");
    expect(fail(["check", "--limit", "5", "f"])).toBe("--limit is only valid for top");
  });

  test("missing file and too many arguments", () => {
    expect(fail(["tree"])).toBe("missing FILE");
    expect(fail(["top", "--limit", "3"])).toBe("missing FILE");
    expect(fail(["tree", "a", "b"])).toBe("too many arguments");
    expect(fail(["tree", "a", "-"])).toBe("too many arguments");
  });

  test("the errors are UsageError instances", () => {
    expect(() => parseArgs([])).toThrow(UsageError);
  });
});

describe("number bounds", () => {
  const minMessage = (v: string) =>
    `invalid --min-total "${v}" (expected a whole number from 0 to 1000000000)`;
  const limitMessage = (v: string) =>
    `invalid --limit "${v}" (expected a whole number from 1 to 1000000)`;

  test("--min-total accepts 0 and 1000000000", () => {
    expect(parseArgs(["tree", "--min-total", "0", "f"])).toMatchObject({ minTotal: 0 });
    expect(parseArgs(["tree", "--min-total", "1000000000", "f"])).toMatchObject({
      minTotal: 1000000000,
    });
  });

  test("--min-total rejects bad forms", () => {
    for (const v of ["+5", "-1", "1.0", "05", "", "1000000001", "1e3", " 5", "x"]) {
      expect(fail(["tree", `--min-total=${v}`, "f"])).toBe(minMessage(v));
    }
  });

  test("--limit accepts 1 and 1000000", () => {
    expect(parseArgs(["top", "--limit", "1", "f"])).toMatchObject({ limit: 1 });
    expect(parseArgs(["top", "--limit", "1000000", "f"])).toMatchObject({ limit: 1000000 });
  });

  test("--limit rejects bad forms", () => {
    for (const v of ["0", "+5", "-1", "1.0", "05", "", "1000001", "x"]) {
      expect(fail(["top", `--limit=${v}`, "f"])).toBe(limitMessage(v));
    }
  });
});
