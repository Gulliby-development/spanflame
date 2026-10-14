import { describe, expect, test } from "bun:test";
import { renderFolded } from "../src/folded";
import { buildForest } from "../src/forest";
import { parseSpans } from "../src/records";
import { renderTop } from "../src/top";
import { renderTree } from "../src/tree-view";
import type { Trace } from "../src/types";

function sp(
  trace: string,
  id: string,
  parent: string | null,
  name: string,
  start: number,
  end: number,
): string {
  if (parent === null) {
    return JSON.stringify({ trace, id, name, start, end });
  }
  return JSON.stringify({ trace, id, parent, name, start, end });
}

function forest(rows: string[]): Trace[] {
  return buildForest(parseSpans(rows.join("\n"), "f.jsonl"));
}

function text(rows: string[]): string {
  return rows.map((row) => `${row}\n`).join("");
}

function chain(n: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    rows.push(sp("t", `s${i}`, i === 0 ? null : `s${i - 1}`, "n", i, 4000 - i));
  }
  return rows;
}

const TRACE_ROWS = [
  sp("t1", "a", null, "GET /users", 0, 1500),
  sp("t1", "b", "a", "auth", 100, 300),
  sp("t1", "c", "a", "db.query", 300, 1200),
  sp("t1", "d", "c", "db.fetch", 400, 900),
  sp("t1", "e", "c", "db.fetch", 700, 1000),
  "",
  sp("t2", "x", null, "GET /health", 5000, 5100),
  sp("t2", "y", "x", "db.query", 5010, 5060),
];

const BAD_ROWS = [
  sp("t1", "a", null, "job", 0, 100),
  sp("t1", "b", "a", "step", 10, 150),
  sp("t1", "a", null, "again", 0, 5),
  sp("t1", "c", "zz", "lost", 20, 30),
  sp("t2", "p", "q", "loop;one", 0, 10),
  sp("t2", "q", "p", "loop two", 0, 10),
  sp("t2", "r", "q", "below", 1, 2),
];

const US = { unit: "us", minTotal: 0 } as const;
const TOP = { unit: "us", limit: 10 } as const;

describe("renderTree", () => {
  test("prints the trace.jsonl example", () => {
    expect(renderTree(forest(TRACE_ROWS), US)).toBe(
      text([
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
      ]),
    );
  });

  test("prints milliseconds with three decimals", () => {
    const t2 = forest(TRACE_ROWS).filter((t) => t.id === "t2");
    expect(renderTree(t2, { unit: "ms", minTotal: 0 })).toBe(
      text([
        "trace t2 (2 spans)",
        "  GET /health 0.100ms (self 0.050ms)",
        "    db.query 0.050ms (self 0.050ms)",
      ]),
    );
  });

  test("min-total hides small spans and their subtrees but keeps the header count", () => {
    expect(renderTree(forest(TRACE_ROWS), { unit: "us", minTotal: 500 })).toBe(
      text([
        "trace t1 (5 spans)",
        "  GET /users 1500us (self 400us)",
        "    db.query 900us (self 300us)",
        "      db.fetch 500us (self 500us)",
        "",
        "trace t2 (2 spans)",
      ]),
    );
  });

  test("min-total equal to the total keeps the span", () => {
    const out = renderTree(forest(TRACE_ROWS), { unit: "us", minTotal: 1500 });
    expect(out).toContain("  GET /users 1500us");
    expect(out).not.toContain("db.query 900us");
  });

  test("a single span uses the singular header", () => {
    expect(renderTree(forest([sp("t", "a", null, "only", 0, 0)]), US)).toBe(
      text(["trace t (1 span)", "  only 0us (self 0us)"]),
    );
  });

  test("prints bad.jsonl without cycle members", () => {
    expect(renderTree(forest(BAD_ROWS), US)).toBe(
      text([
        "trace t1 (3 spans)",
        "  job 100us (self 10us)",
        "    step 140us (self 140us)",
        "  lost 10us (self 10us)",
        "",
        "trace t2 (0 spans)",
      ]),
    );
  });

  test("escapes control characters in trace ids and names", () => {
    const out = renderTree(forest([sp("t\n1", "a", null, "a;b\tc", 0, 5)]), US);
    expect(out).toBe(text(["trace t\\u000a1 (1 span)", "  a;b\\u0009c 5us (self 5us)"]));
  });

  test("handles a chain of 2000 spans", () => {
    const lines = renderTree(forest(chain(2000)), US).split("\n");
    expect(lines.pop()).toBe("");
    expect(lines.length).toBe(2001);
    expect(lines[2000]?.startsWith(`${" ".repeat(4000)}n `)).toBe(true);
  });
});

describe("renderFolded", () => {
  test("prints the trace.jsonl example", () => {
    expect(renderFolded(forest(TRACE_ROWS))).toBe(
      text([
        "GET /health 50",
        "GET /health;db.query 50",
        "GET /users 400",
        "GET /users;auth 200",
        "GET /users;db.query 300",
        "GET /users;db.query;db.fetch 800",
      ]),
    );
  });

  test("drops stacks with zero self time", () => {
    const rows = [sp("t", "p", null, "p", 0, 10), sp("t", "c", "p", "c", 0, 10)];
    expect(renderFolded(forest(rows))).toBe("p;c 10\n");
  });

  test("prints nothing when every self time is zero", () => {
    expect(renderFolded(forest([sp("t", "a", null, "z", 3, 3)]))).toBe("");
  });

  test("sums the same stack over two traces", () => {
    const rows = [sp("t1", "a", null, "a", 0, 10), sp("t2", "a", null, "a", 0, 5)];
    expect(renderFolded(forest(rows))).toBe("a 15\n");
  });

  test("replaces a semicolon in a name with an underscore", () => {
    expect(renderFolded(forest([sp("t", "a", null, "a;b", 0, 10)]))).toBe("a_b 10\n");
  });

  test("sorts by the default string order", () => {
    const rows = [sp("t", "1", null, "a", 0, 1), sp("t", "2", null, "B", 0, 2)];
    expect(renderFolded(forest(rows))).toBe("B 2\na 1\n");
  });

  test("escapes control characters", () => {
    const out = renderFolded(forest([sp("t", "a", null, "a;b\tc", 0, 5)]));
    expect(out).toBe("a_b\\u0009c 5\n");
  });

  test("handles a chain of 2000 spans", () => {
    const lines = renderFolded(forest(chain(2000))).split("\n");
    expect(lines.pop()).toBe("");
    expect(lines.length).toBe(2000);
    const depths = lines.map((l) => l.slice(0, l.lastIndexOf(" ")).split(";").length);
    expect(Math.max(...depths)).toBe(2000);
  });
});

describe("renderTop", () => {
  test("prints the trace.jsonl example", () => {
    expect(renderTop(forest(TRACE_ROWS), TOP)).toBe(
      text([
        " SELF  COUNT  SHARE  NAME",
        "800us      2  44.4%  db.fetch",
        "400us      1  22.2%  GET /users",
        "350us      2  19.4%  db.query",
        "200us      1  11.1%  auth",
        " 50us      1   2.8%  GET /health",
      ]),
    );
  });

  test("rounds shares half up", () => {
    expect(renderTop(forest(BAD_ROWS), TOP)).toBe(
      text([
        " SELF  COUNT  SHARE  NAME",
        "140us      1  87.5%  step",
        " 10us      1   6.3%  job",
        " 10us      1   6.3%  lost",
      ]),
    );
  });

  test("limit keeps the first rows", () => {
    expect(renderTop(forest(TRACE_ROWS), { unit: "us", limit: 2 })).toBe(
      text([
        " SELF  COUNT  SHARE  NAME",
        "800us      2  44.4%  db.fetch",
        "400us      1  22.2%  GET /users",
      ]),
    );
  });

  test("default limit of 10 shows 10 of 12 names", () => {
    const rows: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const n = `n${String(i).padStart(2, "0")}`;
      rows.push(sp("t", n, null, n, 0, 10));
    }
    const lines = renderTop(forest(rows), TOP).split("\n");
    expect(lines.pop()).toBe("");
    expect(lines.length).toBe(11);
    expect(lines[1]).toBe("10us      1   8.3%  n01");
    expect(lines[10]).toBe("10us      1   8.3%  n10");
  });

  test("shares are 0.0% when the total self time is zero", () => {
    expect(renderTop(forest([sp("t", "a", null, "z", 5, 5)]), TOP)).toBe(
      text(["SELF  COUNT  SHARE  NAME", " 0us      1   0.0%  z"]),
    );
  });

  test("the ms unit realigns the columns", () => {
    expect(renderTop(forest(TRACE_ROWS), { unit: "ms", limit: 10 })).toBe(
      text([
        "   SELF  COUNT  SHARE  NAME",
        "0.800ms      2  44.4%  db.fetch",
        "0.400ms      1  22.2%  GET /users",
        "0.350ms      2  19.4%  db.query",
        "0.200ms      1  11.1%  auth",
        "0.050ms      1   2.8%  GET /health",
      ]),
    );
  });

  test("escapes control characters in names", () => {
    const out = renderTop(forest([sp("t", "a", null, "a;b\tc", 0, 5)]), TOP);
    expect(out).toBe(text(["SELF  COUNT   SHARE  NAME", " 5us      1  100.0%  a;b\\u0009c"]));
  });
});
