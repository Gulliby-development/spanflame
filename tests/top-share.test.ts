import { describe, expect, test } from "bun:test";
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

function top(rows: string[]): string {
  const traces = buildForest(parseSpans(rows.join("\n"), "f.jsonl"));
  return renderTop(traces, { unit: "us", limit: 10 });
}

function text(rows: string[]): string {
  return rows.map((row) => `${row}\n`).join("");
}

describe("top shares that round to zero", () => {
  test("a share below one tenth of a percent shows <0.1%", () => {
    const out = top([
      sp("a", null, "job", 0, 100000),
      sp("b", "a", "edge", 100, 150),
      sp("c", "a", "under", 200, 249),
    ]);
    expect(out).toBe(
      text([
        "   SELF  COUNT  SHARE  NAME",
        "99901us      1  99.9%  job",
        "   50us      1   0.1%  edge",
        "   49us      1  <0.1%  under",
      ]),
    );
  });

  test("a single microsecond of a large total shows <0.1%", () => {
    const out = top([sp("a", null, "job", 0, 100000), sp("b", "a", "blip", 10, 11)]);
    expect(out).toBe(
      text([
        "   SELF  COUNT   SHARE  NAME",
        "99999us      1  100.0%  job",
        "    1us      1   <0.1%  blip",
      ]),
    );
  });

  test("a name without self time still shows 0.0%", () => {
    const out = top([sp("a", null, "wrap", 0, 100), sp("b", "a", "leaf", 0, 100)]);
    expect(out).toBe(
      text([
        " SELF  COUNT   SHARE  NAME",
        "100us      1  100.0%  leaf",
        "  0us      1    0.0%  wrap",
      ]),
    );
  });

  test("a zero total shows 0.0% and not <0.1%", () => {
    expect(top([sp("a", null, "z", 5, 5)])).toBe(
      text(["SELF  COUNT  SHARE  NAME", " 0us      1   0.0%  z"]),
    );
  });
});
