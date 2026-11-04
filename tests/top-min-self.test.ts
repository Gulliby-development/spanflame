import { describe, expect, test } from "bun:test";
import { parseArgs, type RunArgs } from "../src/args";
import { run } from "../src/cli";
import { buildForest } from "../src/forest";
import { parseSpans } from "../src/records";
import { renderTop } from "../src/top";

function sp(id: string, parent: string | null, name: string, start: number, end: number): string {
  const trace = "t";
  if (parent === null) {
    return JSON.stringify({ trace, id, name, start, end });
  }
  return JSON.stringify({ trace, id, parent, name, start, end });
}

const ROWS = [
  sp("a", null, "job", 0, 1000),
  sp("b", "a", "big", 0, 600),
  sp("c", "a", "mid", 600, 800),
  sp("d", "a", "small", 800, 850),
  sp("e", "a", "small", 850, 900),
];

function top(minSelf: number | undefined, limit = 10): string {
  const traces = buildForest(parseSpans(ROWS.join("\n"), "f.jsonl"));
  return renderTop(traces, { unit: "us", limit, minSelf });
}

function text(rows: string[]): string {
  return rows.map((row) => `${row}\n`).join("");
}

function exec(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const code = run(args, {
    readStdin: () => new TextEncoder().encode(ROWS.join("\n")),
    readFile: () => new TextEncoder().encode(ROWS.join("\n")),
    out: (value) => {
      out += value;
    },
    err: (value) => {
      err += value;
    },
  });
  return { code, out, err };
}

describe("top --min-self", () => {
  test("without the option every name is listed", () => {
    expect(top(undefined)).toBe(
      text([
        " SELF  COUNT  SHARE  NAME",
        "600us      1  60.0%  big",
        "200us      1  20.0%  mid",
        "100us      1  10.0%  job",
        "100us      2  10.0%  small",
      ]),
    );
  });

  test("a name below the minimum is left out and the shares stay as they are", () => {
    expect(top(150)).toBe(
      text([" SELF  COUNT  SHARE  NAME", "600us      1  60.0%  big", "200us      1  20.0%  mid"]),
    );
  });

  test("a name whose self time equals the minimum stays", () => {
    expect(top(200)).toBe(top(150));
    expect(top(100)).toBe(top(undefined));
    expect(top(201)).toBe(text([" SELF  COUNT  SHARE  NAME", "600us      1  60.0%  big"]));
  });

  test("the minimum counts the self time of a name, not of one span", () => {
    expect(top(100)).toContain("100us      2  10.0%  small");
    expect(top(101)).not.toContain("small");
  });

  test("a minimum above every name leaves the heading only", () => {
    expect(top(1000000000)).toBe("SELF  COUNT  SHARE  NAME\n");
  });

  test("the limit counts the names that stay", () => {
    expect(top(150, 1)).toBe(text([" SELF  COUNT  SHARE  NAME", "600us      1  60.0%  big"]));
    expect(top(100, 3)).toBe(
      text([
        " SELF  COUNT  SHARE  NAME",
        "600us      1  60.0%  big",
        "200us      1  20.0%  mid",
        "100us      1  10.0%  job",
      ]),
    );
  });

  test("the command line passes the value to top", () => {
    const result = exec(["top", "--min-self", "250", "f.jsonl"]);
    expect(result).toEqual({
      code: 0,
      err: "",
      out: text([" SELF  COUNT  SHARE  NAME", "600us      1  60.0%  big"]),
    });
    expect(exec(["top", "--min-self=250", "f.jsonl"])).toEqual(result);
  });

  test("the minimum is not scaled by --unit", () => {
    const result = exec(["top", "--unit", "ms", "--min-self", "250", "f.jsonl"]);
    expect(result.out).toBe(text(["   SELF  COUNT  SHARE  NAME", "0.600ms      1  60.0%  big"]));
  });
});

describe("--min-self arguments", () => {
  test("the default is none and a good value is read", () => {
    expect((parseArgs(["top", "f"]) as RunArgs).minSelf).toBeUndefined();
    expect((parseArgs(["top", "--min-self", "0", "f"]) as RunArgs).minSelf).toBe(0);
    expect((parseArgs(["top", "--min-self", "1000000000", "f"]) as RunArgs).minSelf).toBe(
      1000000000,
    );
  });

  test("a bad value is a usage error", () => {
    for (const value of ["-1", "1000000001", "1.5", "x", "007", ""]) {
      const result = exec(["top", "--min-self", value, "f.jsonl"]);
      expect(result.code).toBe(2);
      expect(result.out).toBe("");
      expect(result.err).toBe(
        `spanflame: invalid --min-self "${value}" (expected a whole number from 0 to 1000000000)\n`,
      );
    }
  });

  test("a missing value is a usage error", () => {
    expect(exec(["top", "f.jsonl", "--min-self"]).err).toBe(
      "spanflame: --min-self needs a value\n",
    );
  });

  test("the option belongs to top only", () => {
    for (const command of ["tree", "folded", "check"]) {
      const result = exec([command, "--min-self", "5", "f.jsonl"]);
      expect(result.code).toBe(2);
      expect(result.err).toBe("spanflame: --min-self is only valid for top\n");
    }
  });
});
