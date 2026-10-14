import { describe, expect, test } from "bun:test";
import { displayPath, escapeText, formatDuration, plural } from "../src/text";

describe("escapeText", () => {
  test("escapes a tab", () => {
    expect(escapeText("a;b\tc")).toBe("a;b\\u0009c");
  });

  test("escapes the control boundaries", () => {
    expect(escapeText("\u0000")).toBe("\\u0000");
    expect(escapeText("\u001f")).toBe("\\u001f");
    expect(escapeText("\u007f")).toBe("\\u007f");
  });

  test("escapes a line feed", () => {
    expect(escapeText("x\ny")).toBe("x\\u000ay");
  });

  test("leaves the neighbours of the ranges unchanged", () => {
    expect(escapeText(" ")).toBe(" ");
    expect(escapeText("\u0080")).toBe("\u0080");
    expect(escapeText("~")).toBe("~");
  });

  test("leaves letters, backslash and quote unchanged", () => {
    expect(escapeText("é")).toBe("é");
    expect(escapeText("\\")).toBe("\\");
    expect(escapeText('"')).toBe('"');
  });

  test("empty string", () => {
    expect(escapeText("")).toBe("");
  });
});

describe("formatDuration", () => {
  test("microseconds", () => {
    expect(formatDuration(1500, "us")).toBe("1500us");
    expect(formatDuration(0, "us")).toBe("0us");
  });

  test("milliseconds with three decimals", () => {
    expect(formatDuration(1500, "ms")).toBe("1.500ms");
    expect(formatDuration(50, "ms")).toBe("0.050ms");
    expect(formatDuration(0, "ms")).toBe("0.000ms");
    expect(formatDuration(999, "ms")).toBe("0.999ms");
    expect(formatDuration(1000, "ms")).toBe("1.000ms");
  });

  test("largest value", () => {
    expect(formatDuration(1000000000, "ms")).toBe("1000000.000ms");
  });
});

describe("plural", () => {
  test("spans", () => {
    expect(plural(0, "span")).toBe("0 spans");
    expect(plural(1, "span")).toBe("1 span");
    expect(plural(2, "span")).toBe("2 spans");
  });

  test("traces", () => {
    expect(plural(1, "trace")).toBe("1 trace");
    expect(plural(2, "trace")).toBe("2 traces");
  });
});

describe("displayPath", () => {
  test("dash is standard input", () => {
    expect(displayPath("-")).toBe("<stdin>");
  });

  test("backslashes become slashes", () => {
    expect(displayPath("dir\\sub\\x.jsonl")).toBe("dir/sub/x.jsonl");
  });

  test("other paths are unchanged", () => {
    expect(displayPath("a/b.jsonl")).toBe("a/b.jsonl");
    expect(displayPath("--")).toBe("--");
  });
});
