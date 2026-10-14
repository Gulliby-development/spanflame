import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseArgs } from "../src/args";
import { type Io, run } from "../src/cli";

const encoder = new TextEncoder();

interface Result {
  code: number;
  out: string;
  err: string;
}

function exec(args: string[], files: Record<string, string> = {}): Result {
  const contents = new Map(
    Object.entries(files).map(([path, text]) => [path, encoder.encode(text)]),
  );
  let out = "";
  let err = "";
  const io: Io = {
    readStdin: () => new Uint8Array(),
    readFile: (path) => {
      const data = contents.get(path);
      if (data === undefined) {
        throw new Error("ENOENT");
      }
      return data;
    },
    out: (text) => {
      out += text;
    },
    err: (text) => {
      err += text;
    },
  };
  const code = run(args, io);
  return { code, out, err };
}

function lines(...items: string[]): string {
  return `${items.join("\n")}\n`;
}

const TRACE = lines(
  '{"trace":"t1","id":"a","name":"GET /users","start":0,"end":1500}',
  '{"trace":"t1","id":"b","parent":"a","name":"auth","start":100,"end":300}',
  '{"trace":"t1","id":"c","parent":"a","name":"db.query","start":300,"end":1200}',
  '{"trace":"t1","id":"d","parent":"c","name":"db.fetch","start":400,"end":900}',
  '{"trace":"t1","id":"e","parent":"c","name":"db.fetch","start":700,"end":1000}',
  "",
  '{"trace":"t2","id":"x","name":"GET /health","start":5000,"end":5100}',
  '{"trace":"t2","id":"y","parent":"x","name":"db.query","start":5010,"end":5060}',
);

const FILES = { "trace.jsonl": TRACE };

function chain(count: number): string {
  const rows: string[] = [];
  for (let index = 0; index < count; index++) {
    const parent = index === 0 ? "" : `"parent":"s${index - 1}",`;
    rows.push(
      `{"trace":"t","id":"s${index}",${parent}"name":"n${index}","start":${index},"end":${1000000 - index}}`,
    );
  }
  return `${rows.join("\n")}\n`;
}

describe("--max-depth parsing", () => {
  test("parses the separate spelling among the arguments", () => {
    expect(parseArgs(["tree", "--max-depth", "2", "trace.jsonl"])).toMatchObject({
      maxDepth: 2,
    });
  });

  test("parses the equals spelling after the file", () => {
    expect(parseArgs(["tree", "trace.jsonl", "--max-depth=2"])).toMatchObject({
      maxDepth: 2,
    });
  });

  test("the last repeated option value wins", () => {
    expect(parseArgs(["tree", "--max-depth", "3", "trace.jsonl", "--max-depth=1"])).toMatchObject({
      maxDepth: 1,
    });
  });

  test("accepts the lower boundary", () => {
    expect(parseArgs(["tree", "--max-depth", "1", "trace.jsonl"])).toMatchObject({
      maxDepth: 1,
    });
  });

  test("accepts the upper boundary", () => {
    expect(parseArgs(["tree", "--max-depth", "1000", "trace.jsonl"])).toMatchObject({
      maxDepth: 1000,
    });
  });

  test("rejects zero", () => {
    expect(() => parseArgs(["tree", "--max-depth", "0", "trace.jsonl"])).toThrow(
      'invalid --max-depth "0" (expected a whole number from 1 to 1000)',
    );
  });

  test("rejects a leading zero", () => {
    expect(() => parseArgs(["tree", "--max-depth", "01", "trace.jsonl"])).toThrow(
      'invalid --max-depth "01" (expected a whole number from 1 to 1000)',
    );
  });

  test("rejects a negative value", () => {
    expect(() => parseArgs(["tree", "--max-depth", "-1", "trace.jsonl"])).toThrow(
      'invalid --max-depth "-1" (expected a whole number from 1 to 1000)',
    );
  });

  test("rejects a positive sign", () => {
    expect(() => parseArgs(["tree", "--max-depth", "+1", "trace.jsonl"])).toThrow(
      'invalid --max-depth "+1" (expected a whole number from 1 to 1000)',
    );
  });

  test("rejects a decimal fraction", () => {
    expect(() => parseArgs(["tree", "--max-depth", "1.5", "trace.jsonl"])).toThrow(
      'invalid --max-depth "1.5" (expected a whole number from 1 to 1000)',
    );
  });

  test("rejects non-numeric text", () => {
    expect(() => parseArgs(["tree", "--max-depth", "x", "trace.jsonl"])).toThrow(
      'invalid --max-depth "x" (expected a whole number from 1 to 1000)',
    );
  });

  test("rejects an empty value", () => {
    expect(() => parseArgs(["tree", "--max-depth=", "trace.jsonl"])).toThrow(
      'invalid --max-depth "" (expected a whole number from 1 to 1000)',
    );
  });

  test("rejects values above the upper boundary", () => {
    expect(() => parseArgs(["tree", "--max-depth", "1001", "trace.jsonl"])).toThrow(
      'invalid --max-depth "1001" (expected a whole number from 1 to 1000)',
    );
  });
});

describe("--max-depth tree output", () => {
  test("depth one and two match the documented output and use LF", () => {
    const depthTwo = exec(["tree", "--max-depth", "2", "trace.jsonl"], FILES);
    expect(depthTwo).toEqual({
      code: 0,
      err: "",
      out: lines(
        "trace t1 (5 spans)",
        "  GET /users 1500us (self 400us)",
        "    auth 200us (self 200us)",
        "    db.query 900us (self 300us)",
        "",
        "trace t2 (2 spans)",
        "  GET /health 100us (self 50us)",
        "    db.query 50us (self 50us)",
      ),
    });
    expect(depthTwo.out.includes("\r")).toBe(false);

    expect(exec(["tree", "--max-depth=1", "trace.jsonl"], FILES)).toEqual({
      code: 0,
      err: "",
      out: lines(
        "trace t1 (5 spans)",
        "  GET /users 1500us (self 400us)",
        "",
        "trace t2 (2 spans)",
        "  GET /health 100us (self 50us)",
      ),
    });
  });

  test("depth three matches unbounded output on the fixture", () => {
    expect(exec(["tree", "trace.jsonl"], FILES)).toEqual(
      exec(["tree", "--max-depth", "3", "trace.jsonl"], FILES),
    );
  });

  test("depth one thousand matches unbounded output on the fixture", () => {
    expect(exec(["tree", "trace.jsonl"], FILES)).toEqual(
      exec(["tree", "--max-depth", "1000", "trace.jsonl"], FILES),
    );
  });

  test("combines depth, minimum total and milliseconds without changing retained times", () => {
    expect(
      exec(
        ["tree", "--max-depth", "2", "--min-total", "250", "--unit", "ms", "trace.jsonl"],
        FILES,
      ),
    ).toEqual({
      code: 0,
      err: "",
      out: lines(
        "trace t1 (5 spans)",
        "  GET /users 1.500ms (self 0.400ms)",
        "    db.query 0.900ms (self 0.300ms)",
        "",
        "trace t2 (2 spans)",
      ),
    });
  });

  test("combines trace selection with a depth limit", () => {
    expect(exec(["tree", "--trace", "t2", "--max-depth", "1", "trace.jsonl"], FILES)).toEqual({
      code: 0,
      err: "",
      out: lines("trace t2 (2 spans)", "  GET /health 100us (self 50us)"),
    });
  });

  test("cuts a 2000-level chain iteratively", () => {
    const result = exec(["tree", "--max-depth", "3", "deep.jsonl"], {
      "deep.jsonl": chain(2000),
    });
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    const rows = result.out.split("\n");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toBe("trace t (2000 spans)");
    expect(rows[1]?.startsWith("  n0 ")).toBe(true);
    expect(rows[2]?.startsWith("    n1 ")).toBe(true);
    expect(rows[3]?.startsWith("      n2 ")).toBe(true);
    expect(rows[4]).toBe("");
  });
});

describe("--max-depth CLI errors", () => {
  test("reports a missing value with the standard usage error form", () => {
    expect(exec(["tree", "--max-depth"])).toEqual({
      code: 2,
      out: "",
      err: "spanflame: --max-depth needs a value\n",
    });
  });

  test("reports an invalid value with the standard error form", () => {
    expect(exec(["top", "--max-depth", "0", "trace.jsonl"])).toEqual({
      code: 2,
      out: "",
      err: 'spanflame: invalid --max-depth "0" (expected a whole number from 1 to 1000)\n',
    });
  });

  test("validates min-total, max-depth, and command restrictions in order", () => {
    expect(
      exec(["tree", "--min-total", "x", "--max-depth", "0", "--limit", "0", "trace.jsonl"], FILES),
    ).toEqual({
      code: 2,
      out: "",
      err: 'spanflame: invalid --min-total "x" (expected a whole number from 0 to 1000000000)\n',
    });
    expect(exec(["tree", "--max-depth", "0", "--limit", "0", "trace.jsonl"])).toEqual({
      code: 2,
      out: "",
      err: 'spanflame: invalid --max-depth "0" (expected a whole number from 1 to 1000)\n',
    });
    expect(exec(["top", "--max-depth", "0", "trace.jsonl"])).toEqual({
      code: 2,
      out: "",
      err: 'spanflame: invalid --max-depth "0" (expected a whole number from 1 to 1000)\n',
    });
    expect(exec(["top", "--max-depth", "2", "--limit", "1", "trace.jsonl"])).toEqual({
      code: 2,
      out: "",
      err: "spanflame: --max-depth is only valid for tree\n",
    });
    expect(exec(["tree", "--max-depth", "2", "--limit", "1", "trace.jsonl"])).toEqual({
      code: 2,
      out: "",
      err: "spanflame: --limit is only valid for top\n",
    });
  });

  test("is rejected for folded, top, and check", () => {
    for (const command of ["folded", "top", "check"]) {
      expect(exec([command, "--max-depth", "2", "trace.jsonl"])).toEqual({
        code: 2,
        out: "",
        err: "spanflame: --max-depth is only valid for tree\n",
      });
    }
  });
});

describe("--max-depth README documentation", () => {
  test("contains the requested option, explanation, example, and insertion point", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const usage =
      "usage: spanflame tree [--trace ID] [--unit us|ms] [--min-total N] [--max-depth N] FILE";
    const options =
      "`spanflame tree trace.jsonl` prints the trees. Options: `--trace ID` keeps one trace, `--unit us|ms` chooses the unit, `--min-total N` leaves out spans whose total is below N microseconds, `--max-depth N` leaves out spans below level N.";
    const depthDocumentation = [
      "`--max-depth N` (a whole number from 1 to 1000, `tree` only) keeps the first N levels of every tree: a root is level 1, its children level 2, and a span that is left out takes its children with it. The count in the `trace` heading and the self times stay as they are. `spanflame tree --max-depth 2 trace.jsonl` prints:",
      "",
      "```",
      "trace t1 (5 spans)",
      "  GET /users 1500us (self 400us)",
      "    auth 200us (self 200us)",
      "    db.query 900us (self 300us)",
      "",
      "trace t2 (2 spans)",
      "  GET /health 100us (self 50us)",
      "    db.query 50us (self 50us)",
      "```",
    ].join("\n");
    const folded = "`spanflame folded trace.jsonl` prints folded stacks:";

    expect(readme).toContain(usage);
    expect(readme).toContain(options);
    expect(readme).toContain(depthDocumentation);
    expect(readme.indexOf(depthDocumentation)).toBeLessThan(readme.indexOf(folded));
  });
});
