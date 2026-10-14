import { describe, expect, test } from "bun:test";
import { type Io, run } from "../src/cli";

const enc = new TextEncoder();

interface Result {
  code: number;
  out: string;
  err: string;
}

function exec(
  args: string[],
  files: Record<string, string | Uint8Array> = {},
  stdin: Uint8Array = new Uint8Array(),
): Result {
  const map = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(files)) {
    map.set(k, typeof v === "string" ? enc.encode(v) : v);
  }
  let out = "";
  let err = "";
  const io: Io = {
    readStdin: () => stdin,
    readFile: (p: string) => {
      const d = map.get(p);
      if (d === undefined) {
        throw new Error("ENOENT");
      }
      return d;
    },
    out: (t: string) => {
      out += t;
    },
    err: (t: string) => {
      err += t;
    },
  };
  const code = run(args, io);
  return { code, out, err };
}

function lines(...l: string[]): string {
  return `${l.join("\n")}\n`;
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

const BAD = lines(
  '{"trace":"t1","id":"a","name":"job","start":0,"end":100}',
  '{"trace":"t1","id":"b","parent":"a","name":"step","start":10,"end":150}',
  '{"trace":"t1","id":"a","name":"again","start":0,"end":5}',
  '{"trace":"t1","id":"c","parent":"zz","name":"lost","start":20,"end":30}',
  '{"trace":"t2","id":"p","parent":"q","name":"loop;one","start":0,"end":10}',
  '{"trace":"t2","id":"q","parent":"p","name":"loop two","start":0,"end":10}',
  '{"trace":"t2","id":"r","parent":"q","name":"below","start":1,"end":2}',
);

const BAD_WARNINGS = lines(
  'spanflame: warning: bad.jsonl:2: SF004 span "b" (10-150) is not inside its parent "a" (0-100)',
  'spanflame: warning: bad.jsonl:3: SF001 duplicate span id "a" in trace "t1" (first on line 1)',
  'spanflame: warning: bad.jsonl:4: SF002 parent "zz" of span "c" not found in trace "t1"',
  'spanflame: warning: bad.jsonl:5: SF003 parent cycle in trace "t2": "p" -> "q" -> "p"',
);

const files = { "trace.jsonl": TRACE, "bad.jsonl": BAD };

function chain(n: number, name: (i: number) => string): string {
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    const parent = i === 0 ? "" : `"parent":"s${i - 1}",`;
    rows.push(
      `{"trace":"t","id":"s${i}",${parent}"name":"${name(i)}","start":${i},"end":${1000000 - i}}`,
    );
  }
  return `${rows.join("\n")}\n`;
}

describe("cli help and usage", () => {
  test("--help prints the four usage lines", () => {
    expect(exec(["--help"])).toEqual({
      code: 0,
      err: "",
      out: lines(
        "usage: spanflame tree [--trace ID] [--unit us|ms] [--min-total N] FILE",
        "       spanflame folded [--trace ID] FILE",
        "       spanflame top [--trace ID] [--unit us|ms] [--limit N] FILE",
        "       spanflame check [--trace ID] FILE",
      ),
    });
  });

  test("usage errors have empty stdout and exit 2", () => {
    expect(exec([])).toEqual({
      code: 2,
      out: "",
      err: "spanflame: missing command (tree, folded, top or check)\n",
    });
    expect(exec(["tree"], files)).toEqual({
      code: 2,
      out: "",
      err: "spanflame: missing FILE\n",
    });
    expect(exec(["tree", "a", "b"], files)).toEqual({
      code: 2,
      out: "",
      err: "spanflame: too many arguments\n",
    });
  });
});

describe("cli input errors", () => {
  test("missing file with backslash path is shown with slash", () => {
    expect(exec(["tree", "dir\\x.jsonl"])).toEqual({
      code: 2,
      out: "",
      err: "spanflame: dir/x.jsonl: cannot read the file\n",
    });
  });

  test("invalid UTF-8 from a file", () => {
    const r = exec(["tree", "f.jsonl"], { "f.jsonl": new Uint8Array([0xff, 0xfe, 0x41]) });
    expect(r).toEqual({
      code: 2,
      out: "",
      err: "spanflame: f.jsonl: input is not valid UTF-8\n",
    });
  });

  test("invalid UTF-8 from stdin", () => {
    const r = exec(["tree", "-"], {}, new Uint8Array([0xff, 0xfe, 0x41]));
    expect(r).toEqual({
      code: 2,
      out: "",
      err: "spanflame: <stdin>: input is not valid UTF-8\n",
    });
  });

  test("no spans for empty and blank files", () => {
    for (const text of ["", " \t\r\n\n  \r\n"]) {
      expect(exec(["tree", "e.jsonl"], { "e.jsonl": text })).toEqual({
        code: 2,
        out: "",
        err: "spanflame: e.jsonl: no spans\n",
      });
    }
  });

  test("no spans for trace", () => {
    expect(exec(["check", "--trace", "nope", "trace.jsonl"], files)).toEqual({
      code: 2,
      out: "",
      err: 'spanflame: trace.jsonl: no spans for trace "nope"\n',
    });
  });

  test("no spans for trace escapes a tab", () => {
    expect(exec(["tree", "--trace", "x\ty", "trace.jsonl"], files)).toEqual({
      code: 2,
      out: "",
      err: 'spanflame: trace.jsonl: no spans for trace "x\\u0009y"\n',
    });
  });

  test("first bad line is reported", () => {
    const text = lines(
      '{"trace":"t","id":"a","name":"n","start":0,"end":1}',
      "",
      '{"trace":"t"}',
      "{oops",
    );
    expect(exec(["tree", "b.jsonl"], { "b.jsonl": text })).toEqual({
      code: 2,
      out: "",
      err: 'spanflame: b.jsonl:3: "id" must be a non-empty string\n',
    });
  });
});

describe("cli worked examples", () => {
  test("check on stdin", () => {
    expect(exec(["check", "-"], {}, enc.encode(TRACE))).toEqual({
      code: 0,
      err: "",
      out: "<stdin>: ok, 7 spans in 2 traces\n",
    });
  });

  test("check ok on trace.jsonl", () => {
    expect(exec(["check", "trace.jsonl"], files)).toEqual({
      code: 0,
      err: "",
      out: "trace.jsonl: ok, 7 spans in 2 traces\n",
    });
  });

  test("check ok with one span", () => {
    const one = '{"trace":"t","id":"a","name":"n","start":0,"end":1}\n';
    expect(exec(["check", "one.jsonl"], { "one.jsonl": one })).toEqual({
      code: 0,
      err: "",
      out: "one.jsonl: ok, 1 span in 1 trace\n",
    });
  });

  test("tree on trace.jsonl", () => {
    expect(exec(["tree", "trace.jsonl"], files)).toEqual({
      code: 0,
      err: "",
      out: lines(
        "trace t1 (5 spans)",
        "  GET /users 1500us (self 400us)",
        "    auth 200us (self 200us)",
        "    db.query 900us (self 300us)",
        "      db.fetch 500us (self 500us)",
        "      db.fetch 300us (self 300us)",
        "",
        "trace t2 (2 spans)",
        "  GET /health 100us (self 50us)",
        "    db.query 50us (self 50us)",
      ),
    });
  });

  test("tree with --unit ms and --trace", () => {
    expect(exec(["tree", "--unit", "ms", "--trace", "t2", "trace.jsonl"], files)).toEqual({
      code: 0,
      err: "",
      out: lines(
        "trace t2 (2 spans)",
        "  GET /health 0.100ms (self 0.050ms)",
        "    db.query 0.050ms (self 0.050ms)",
      ),
    });
  });

  test("tree with --min-total", () => {
    expect(exec(["tree", "--min-total", "500", "trace.jsonl"], files)).toEqual({
      code: 0,
      err: "",
      out: lines(
        "trace t1 (5 spans)",
        "  GET /users 1500us (self 400us)",
        "    db.query 900us (self 300us)",
        "      db.fetch 500us (self 500us)",
        "",
        "trace t2 (2 spans)",
      ),
    });
  });

  test("folded on trace.jsonl", () => {
    expect(exec(["folded", "trace.jsonl"], files)).toEqual({
      code: 0,
      err: "",
      out: lines(
        "GET /health 50",
        "GET /health;db.query 50",
        "GET /users 400",
        "GET /users;auth 200",
        "GET /users;db.query 300",
        "GET /users;db.query;db.fetch 800",
      ),
    });
  });

  test("top on trace.jsonl", () => {
    expect(exec(["top", "trace.jsonl"], files)).toEqual({
      code: 0,
      err: "",
      out: lines(
        " SELF  COUNT  SHARE  NAME",
        "800us      2  44.4%  db.fetch",
        "400us      1  22.2%  GET /users",
        "350us      2  19.4%  db.query",
        "200us      1  11.1%  auth",
        " 50us      1   2.8%  GET /health",
      ),
    });
  });
});

describe("cli problems", () => {
  test("check on bad.jsonl exits 1", () => {
    expect(exec(["check", "bad.jsonl"], files)).toEqual({
      code: 1,
      err: "",
      out: lines(
        'bad.jsonl:2: SF004 span "b" (10-150) is not inside its parent "a" (0-100)',
        'bad.jsonl:3: SF001 duplicate span id "a" in trace "t1" (first on line 1)',
        'bad.jsonl:4: SF002 parent "zz" of span "c" not found in trace "t1"',
        'bad.jsonl:5: SF003 parent cycle in trace "t2": "p" -> "q" -> "p"',
      ),
    });
  });

  test("tree warns on stderr for bad.jsonl", () => {
    expect(exec(["tree", "bad.jsonl"], files)).toEqual({
      code: 0,
      err: BAD_WARNINGS,
      out: lines(
        "trace t1 (3 spans)",
        "  job 100us (self 10us)",
        "    step 140us (self 140us)",
        "  lost 10us (self 10us)",
        "",
        "trace t2 (0 spans)",
      ),
    });
  });

  test("folded warns on stderr for bad.jsonl", () => {
    expect(exec(["folded", "bad.jsonl"], files)).toEqual({
      code: 0,
      err: BAD_WARNINGS,
      out: lines("job 10", "job;step 140", "lost 10"),
    });
  });

  test("top warns on stderr for bad.jsonl", () => {
    expect(exec(["top", "bad.jsonl"], files)).toEqual({
      code: 0,
      err: BAD_WARNINGS,
      out: lines(
        " SELF  COUNT  SHARE  NAME",
        "140us      1  87.5%  step",
        " 10us      1   6.3%  job",
        " 10us      1   6.3%  lost",
      ),
    });
  });

  test("--trace filters problems and output", () => {
    const t1 = exec(["check", "--trace", "t1", "bad.jsonl"], files);
    expect(t1.code).toBe(1);
    expect(t1.err).toBe("");
    expect(t1.out).toBe(
      lines(
        'bad.jsonl:2: SF004 span "b" (10-150) is not inside its parent "a" (0-100)',
        'bad.jsonl:3: SF001 duplicate span id "a" in trace "t1" (first on line 1)',
        'bad.jsonl:4: SF002 parent "zz" of span "c" not found in trace "t1"',
      ),
    );
    expect(exec(["check", "--trace", "t2", "trace.jsonl"], files)).toEqual({
      code: 0,
      err: "",
      out: "trace.jsonl: ok, 2 spans in 1 trace\n",
    });
    expect(exec(["folded", "--trace", "t2", "trace.jsonl"], files)).toEqual({
      code: 0,
      err: "",
      out: lines("GET /health 50", "GET /health;db.query 50"),
    });
    expect(exec(["top", "--trace", "t2", "trace.jsonl"], files)).toEqual({
      code: 0,
      err: "",
      out: lines(
        "SELF  COUNT  SHARE  NAME",
        "50us      1  50.0%  GET /health",
        "50us      1  50.0%  db.query",
      ),
    });
    expect(exec(["tree", "--trace", "t2", "bad.jsonl"], files)).toEqual({
      code: 0,
      err: lines(
        'spanflame: warning: bad.jsonl:5: SF003 parent cycle in trace "t2": "p" -> "q" -> "p"',
      ),
      out: "trace t2 (0 spans)\n",
    });
  });
});

describe("cli escaping and output form", () => {
  const tabbed = lines('{"trace":"t","id":"a","name":"a;b\\tc","start":0,"end":10}');

  test("escaped names in tree and folded", () => {
    expect(exec(["tree", "t.jsonl"], { "t.jsonl": tabbed })).toEqual({
      code: 0,
      err: "",
      out: lines("trace t (1 span)", "  a;b\\u0009c 10us (self 10us)"),
    });
    expect(exec(["folded", "t.jsonl"], { "t.jsonl": tabbed })).toEqual({
      code: 0,
      err: "",
      out: lines("a_b\\u0009c 10"),
    });
  });

  test("no output contains CR or a BOM", () => {
    const crlf = `\uFEFF${TRACE.replace(/\n/g, "\r\n")}`;
    const f = { "c.jsonl": crlf, "bad.jsonl": BAD };
    const runs = [
      ["tree", "c.jsonl"],
      ["folded", "c.jsonl"],
      ["top", "c.jsonl"],
      ["check", "c.jsonl"],
      ["check", "bad.jsonl"],
      ["tree", "bad.jsonl"],
      ["--help"],
    ];
    for (const args of runs) {
      const r = exec(args, f);
      for (const text of [r.out, r.err]) {
        expect(text.includes("\r")).toBe(false);
        expect(text.includes("\uFEFF")).toBe(false);
        if (text.length > 0) {
          expect(text.endsWith("\n")).toBe(true);
        }
      }
    }
    expect(exec(["check", "c.jsonl"], f).out).toBe("c.jsonl: ok, 7 spans in 2 traces\n");
  });
});

describe("cli deep chains", () => {
  test("check and top on a 50000 chain", () => {
    const f = { "deep.jsonl": chain(50000, () => "n") };
    expect(exec(["check", "deep.jsonl"], f)).toEqual({
      code: 0,
      err: "",
      out: "deep.jsonl: ok, 50000 spans in 1 trace\n",
    });
    const top = exec(["top", "deep.jsonl"], f);
    expect(top.code).toBe(0);
    expect(top.err).toBe("");
    const rows = top.out.split("\n");
    expect(rows.length).toBe(3);
    expect(rows[1]?.endsWith("100.0%  n")).toBe(true);
  }, 30000);

  test("tree and folded on a 2000 chain", () => {
    const f = { "deep.jsonl": chain(2000, (i) => `n${i}`) };
    const tree = exec(["tree", "deep.jsonl"], f);
    expect(tree.code).toBe(0);
    expect(tree.err).toBe("");
    const rows = tree.out.split("\n");
    expect(rows.length).toBe(2002);
    expect(rows[2000]?.startsWith(`${" ".repeat(4000)}n1999 `)).toBe(true);
    const folded = exec(["folded", "deep.jsonl"], f);
    expect(folded.code).toBe(0);
    const stacks = folded.out.split("\n").filter((l) => l.length > 0);
    expect(stacks.length).toBe(2000);
    const longest = Math.max(...stacks.map((l) => l.split(" ")[0]?.split(";").length ?? 0));
    expect(longest).toBe(2000);
  }, 30000);
});
