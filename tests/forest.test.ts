import { describe, expect, test } from "bun:test";
import { buildForest } from "../src/forest";
import type { Span } from "../src/types";

function sp(
  trace: string,
  id: string,
  parent: string | null,
  start: number,
  end: number,
  line: number,
  name = id,
): Span {
  return { trace, id, parent, name, start, end, line };
}

function badSpans(): Span[] {
  return [
    sp("t1", "a", null, 0, 100, 1, "job"),
    sp("t1", "b", "a", 10, 150, 2, "step"),
    sp("t1", "a", null, 0, 5, 3, "again"),
    sp("t1", "c", "zz", 20, 30, 4, "lost"),
    sp("t2", "p", "q", 0, 10, 5, "loop;one"),
    sp("t2", "q", "p", 0, 10, 6, "loop two"),
    sp("t2", "r", "q", 1, 2, 7, "below"),
  ];
}

describe("buildForest", () => {
  test("traces keep the order of their first line", () => {
    const traces = buildForest([
      sp("z", "a", null, 0, 1, 1),
      sp("m", "a", null, 0, 1, 2),
      sp("z", "b", null, 0, 1, 3),
    ]);
    expect(traces.map((t) => t.id)).toEqual(["z", "m"]);
    expect(traces[0]?.spanCount).toBe(2);
  });

  test("roots are ordered by start, then by line", () => {
    const [t] = buildForest([
      sp("t", "late", null, 50, 60, 1),
      sp("t", "tie2", null, 10, 20, 2),
      sp("t", "early", null, 5, 6, 3),
      sp("t", "tie1", null, 10, 20, 0),
    ]);
    expect(t?.roots.map((n) => n.span.id)).toEqual(["early", "tie1", "tie2", "late"]);
  });

  test("children are ordered by start, then by line", () => {
    const [t] = buildForest([
      sp("t", "r", null, 0, 100, 1),
      sp("t", "c3", "r", 30, 40, 2),
      sp("t", "c2", "r", 10, 20, 3),
      sp("t", "c1", "r", 10, 20, 4),
    ]);
    expect(t?.roots[0]?.children.map((n) => n.span.id)).toEqual(["c2", "c1", "c3"]);
  });

  test("total and self with overlapping children", () => {
    const [t] = buildForest([
      sp("t", "a", null, 0, 1500, 1),
      sp("t", "b", "a", 100, 300, 2),
      sp("t", "c", "a", 300, 1200, 3),
      sp("t", "d", "c", 400, 900, 4),
      sp("t", "e", "c", 700, 1000, 5),
    ]);
    const a = t?.roots[0];
    expect(a?.total).toBe(1500);
    expect(a?.self).toBe(400);
    const c = a?.children[1];
    expect(c?.total).toBe(900);
    expect(c?.self).toBe(300);
    expect(c?.children.map((n) => n.self)).toEqual([500, 300]);
    expect(t?.shown).toBe(5);
    expect(t?.problems).toEqual([]);
  });

  test("zero-length span has total 0 and self 0", () => {
    const [t] = buildForest([sp("t", "a", null, 5, 5, 1)]);
    expect(t?.roots[0]?.total).toBe(0);
    expect(t?.roots[0]?.self).toBe(0);
  });

  test("SF001: a duplicate id is left out", () => {
    const [t] = buildForest([
      sp("t", "a", null, 0, 10, 1),
      sp("t", "a", null, 0, 5, 2),
      sp("t", "a", null, 0, 6, 4),
    ]);
    expect(t?.roots.length).toBe(1);
    expect(t?.roots[0]?.span.line).toBe(1);
    expect(t?.shown).toBe(1);
    expect(t?.spanCount).toBe(3);
    expect(t?.problems).toEqual([
      { line: 2, code: "SF001", message: 'duplicate span id "a" in trace "t" (first on line 1)' },
      { line: 4, code: "SF001", message: 'duplicate span id "a" in trace "t" (first on line 1)' },
    ]);
  });

  test("SF002: a missing parent makes the span a root", () => {
    const [t] = buildForest([sp("t", "c", "zz", 20, 30, 4)]);
    expect(t?.roots.map((n) => n.span.id)).toEqual(["c"]);
    expect(t?.shown).toBe(1);
    expect(t?.problems).toEqual([
      { line: 4, code: "SF002", message: 'parent "zz" of span "c" not found in trace "t"' },
    ]);
  });

  test("SF003: a span that is its own parent", () => {
    const [t] = buildForest([sp("t", "s", "s", 0, 10, 1)]);
    expect(t?.roots).toEqual([]);
    expect(t?.shown).toBe(0);
    expect(t?.spanCount).toBe(1);
    expect(t?.problems).toEqual([
      { line: 1, code: "SF003", message: 'parent cycle in trace "t": "s" -> "s"' },
    ]);
  });

  test("SF003: a two-span cycle is reported at the earlier line, starting with that member", () => {
    const [t] = buildForest([sp("t", "q", "p", 0, 10, 1), sp("t", "p", "q", 0, 10, 2)]);
    expect(t?.problems).toEqual([
      { line: 1, code: "SF003", message: 'parent cycle in trace "t": "q" -> "p" -> "q"' },
    ]);
    expect(t?.shown).toBe(0);
  });

  test("SF003: a cycle starting from a later line is still reported once at the first member", () => {
    const [t] = buildForest([
      sp("t", "x", "p", 0, 10, 1),
      sp("t", "p", "q", 0, 10, 2),
      sp("t", "q", "p", 0, 10, 3),
    ]);
    expect(t?.problems).toEqual([
      { line: 2, code: "SF003", message: 'parent cycle in trace "t": "p" -> "q" -> "p"' },
    ]);
    expect(t?.shown).toBe(0);
  });

  test("spans below a cycle are left out", () => {
    const traces = buildForest(badSpans());
    const t2 = traces[1];
    expect(t2?.roots).toEqual([]);
    expect(t2?.shown).toBe(0);
    expect(t2?.spanCount).toBe(3);
    expect(t2?.problems).toEqual([
      { line: 5, code: "SF003", message: 'parent cycle in trace "t2": "p" -> "q" -> "p"' },
    ]);
  });

  test("SF004: child outside its parent, both directions", () => {
    const [t] = buildForest([
      sp("t", "a", null, 10, 100, 1),
      sp("t", "b", "a", 5, 50, 2),
      sp("t", "c", "a", 20, 101, 3),
      sp("t", "d", "a", 10, 100, 4),
    ]);
    expect(t?.problems).toEqual([
      { line: 2, code: "SF004", message: 'span "b" (5-50) is not inside its parent "a" (10-100)' },
      {
        line: 3,
        code: "SF004",
        message: 'span "c" (20-101) is not inside its parent "a" (10-100)',
      },
    ]);
  });

  test("the same ids in two traces give no problem", () => {
    const traces = buildForest([
      sp("t1", "a", null, 0, 10, 1),
      sp("t2", "a", null, 0, 10, 2),
      sp("t1", "b", "a", 1, 2, 3),
      sp("t2", "b", "a", 1, 2, 4),
    ]);
    expect(traces.map((t) => t.problems)).toEqual([[], []]);
    expect(traces.map((t) => t.shown)).toEqual([2, 2]);
  });

  test("problems are sorted by line", () => {
    const traces = buildForest(badSpans());
    expect(traces[0]?.problems.map((p) => [p.line, p.code])).toEqual([
      [2, "SF004"],
      [3, "SF001"],
      [4, "SF002"],
    ]);
    expect(traces[0]?.problems[0]?.message).toBe(
      'span "b" (10-150) is not inside its parent "a" (0-100)',
    );
  });

  test("bad.jsonl: spanCount, shown, roots and self times", () => {
    const [t1, t2] = buildForest(badSpans());
    expect(t1?.spanCount).toBe(4);
    expect(t1?.shown).toBe(3);
    expect(t1?.roots.map((n) => n.span.id)).toEqual(["a", "c"]);
    const job = t1?.roots[0];
    expect(job?.self).toBe(10);
    expect(job?.children[0]?.self).toBe(140);
    expect(t2?.spanCount).toBe(3);
    expect(t2?.shown).toBe(0);
  });

  test("control characters are escaped in problem messages", () => {
    const [t] = buildForest([sp("t\n", "a\tb", "x", 0, 1, 1)]);
    expect(t?.problems[0]?.message).toBe(
      'parent "x" of span "a\\u0009b" not found in trace "t\\u000a"',
    );
  });

  test("a chain of 50000 spans builds without a stack overflow", () => {
    const n = 50000;
    const spans: Span[] = [];
    for (let i = 0; i < n; i++) {
      spans.push(sp("t", `s${i}`, i === 0 ? null : `s${i - 1}`, i, 100000 - i, i + 1));
    }
    const [t] = buildForest(spans);
    expect(t?.shown).toBe(n);
    expect(t?.spanCount).toBe(n);
    expect(t?.problems).toEqual([]);
    expect(t?.roots[0]?.total).toBe(100000);
    expect(t?.roots[0]?.self).toBe(2);
  });
});
