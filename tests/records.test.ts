import { describe, expect, test } from "bun:test";
import { parseSpans } from "../src/records";
import { InputError } from "../src/types";

const F = "f.jsonl";
const GOOD = '{"trace":"t","id":"a","name":"n","start":0,"end":1}';

function failure(text: string): string {
  try {
    parseSpans(text, F);
  } catch (e) {
    expect(e).toBeInstanceOf(InputError);
    return (e as Error).message;
  }
  throw new Error("expected parseSpans to throw");
}

describe("parseSpans accepted forms", () => {
  test("returns no spans for empty and blank-only text", () => {
    expect(parseSpans("", F)).toEqual([]);
    expect(parseSpans(" \n\t\n\r\n", F)).toEqual([]);
  });

  test("parses a BOM, CRLF line ends and exponent numbers", () => {
    const text = '\uFEFF{"trace":"t","id":"a","name":"n","start":1e1,"end":3e1}\r\n';
    const spans = parseSpans(text, F);
    expect(spans).toEqual([
      { trace: "t", id: "a", parent: null, name: "n", start: 10, end: 30, line: 1 },
    ]);
  });

  test("accepts 5, 5.0 and 5e0 as the same start", () => {
    for (const s of ["5", "5.0", "5e0"]) {
      const spans = parseSpans(`{"trace":"t","id":"a","name":"n","start":${s},"end":9}`, F);
      expect(spans[0]?.start).toBe(5);
    }
  });

  test("accepts the bounds 0 and 1000000000", () => {
    const spans = parseSpans('{"trace":"t","id":"a","name":"n","start":0,"end":1000000000}', F);
    expect(spans[0]?.start).toBe(0);
    expect(spans[0]?.end).toBe(1000000000);
  });

  test("accepts start equal to end", () => {
    const spans = parseSpans('{"trace":"t","id":"a","name":"n","start":7,"end":7}', F);
    expect(spans).toHaveLength(1);
  });

  test("a repeated key keeps the last value", () => {
    const spans = parseSpans('{"trace":"t","trace":"u","id":"a","name":"n","start":0,"end":1}', F);
    expect(spans[0]?.trace).toBe("u");
  });

  test("ignores unknown keys", () => {
    const spans = parseSpans('{"trace":"t","id":"a","name":"n","start":0,"end":1,"x":1}', F);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.id).toBe("a");
  });

  test("an absent or null parent is a root, a string parent is kept", () => {
    const text = [
      GOOD,
      '{"trace":"t","id":"b","parent":null,"name":"n","start":0,"end":1}',
      '{"trace":"t","id":"c","parent":"a","name":"n","start":0,"end":1}',
    ].join("\n");
    const spans = parseSpans(text, F);
    expect(spans.map((s) => s.parent)).toEqual([null, null, "a"]);
  });

  test("blank lines are skipped but counted in line numbers", () => {
    const text = `${GOOD}\n \t \n\r\n${GOOD.replace('"a"', '"b"')}\n`;
    const spans = parseSpans(text, F);
    expect(spans.map((s) => s.line)).toEqual([1, 4]);
  });

  test("a blank line before the first span shifts its line number", () => {
    const spans = parseSpans(`\n${GOOD}`, F);
    expect(spans[0]?.line).toBe(2);
  });
});

describe("parseSpans errors", () => {
  const cases: [string, string, string][] = [
    ["invalid JSON", "{oops", "invalid JSON"],
    ["array", "[1]", "not a JSON object"],
    ["null", "null", "not a JSON object"],
    ["number", "5", "not a JSON object"],
    ["string", '"x"', "not a JSON object"],
    ["missing trace", "{}", '"trace" must be a non-empty string'],
    [
      "empty trace",
      '{"trace":"","id":"a","name":"n","start":0,"end":1}',
      '"trace" must be a non-empty string',
    ],
    [
      "numeric trace",
      '{"trace":5,"id":"a","name":"n","start":0,"end":1}',
      '"trace" must be a non-empty string',
    ],
    ["missing id", '{"trace":"t"}', '"id" must be a non-empty string'],
    [
      "empty id",
      '{"trace":"t","id":"","name":"n","start":0,"end":1}',
      '"id" must be a non-empty string',
    ],
    [
      "missing name",
      '{"trace":"t","id":"a","start":0,"end":1}',
      '"name" must be a non-empty string',
    ],
    [
      "empty name",
      '{"trace":"t","id":"a","name":"","start":0,"end":1}',
      '"name" must be a non-empty string',
    ],
    [
      "boolean parent",
      '{"trace":"t","id":"a","parent":true,"name":"n","start":0,"end":1}',
      '"parent" must be a non-empty string or null',
    ],
    [
      "numeric parent",
      '{"trace":"t","id":"a","parent":5,"name":"n","start":0,"end":1}',
      '"parent" must be a non-empty string or null',
    ],
  ];

  for (const [label, text, message] of cases) {
    test(`reports ${label}`, () => {
      expect(failure(text)).toBe(`${F}:1: ${message}`);
    });
  }

  const startMsg = '"start" must be a whole number from 0 to 1000000000';
  const endMsg = '"end" must be a whole number from 0 to 1000000000';

  test("rejects bad start values", () => {
    for (const s of ["1.5", "-1", "1000000001", '"5"']) {
      const text = `{"trace":"t","id":"a","name":"n","start":${s},"end":9}`;
      expect(failure(text)).toBe(`${F}:1: ${startMsg}`);
    }
    expect(failure('{"trace":"t","id":"a","name":"n","end":9}')).toBe(`${F}:1: ${startMsg}`);
  });

  test("rejects bad end values", () => {
    for (const e of ["1.5", "-1", "1000000001", '"5"']) {
      const text = `{"trace":"t","id":"a","name":"n","start":0,"end":${e}}`;
      expect(failure(text)).toBe(`${F}:1: ${endMsg}`);
    }
    expect(failure('{"trace":"t","id":"a","name":"n","start":0}')).toBe(`${F}:1: ${endMsg}`);
  });

  test("rejects end before start", () => {
    const text = '{"trace":"t","id":"a","name":"n","start":10,"end":5}';
    expect(failure(text)).toBe(`${F}:1: "end" is before "start"`);
  });

  test("a line failing several checks reports the earliest", () => {
    const text = '{"trace":"t","name":"n","start":-1,"end":2}';
    expect(failure(text)).toBe(`${F}:1: "id" must be a non-empty string`);
  });

  test("reports only the first bad line with its physical line number", () => {
    const text = `${GOOD}\n\n{oops\n[1]`;
    expect(failure(text)).toBe(`${F}:3: invalid JSON`);
  });

  test("a CRLF file reports the line number of the bad line", () => {
    const text = `${GOOD}\r\n{"trace":"t"}\r\n`;
    expect(failure(text)).toBe(`${F}:2: "id" must be a non-empty string`);
  });
});
