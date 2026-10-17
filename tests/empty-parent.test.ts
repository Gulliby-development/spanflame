import { describe, expect, test } from "bun:test";
import { type Io, run as runCli } from "../src/cli";
import { parseSpans } from "../src/records";

const FILE = "spans.jsonl";
const enc = new TextEncoder();

interface Result {
  code: number;
  out: string;
  err: string;
}

function lines(...values: string[]): string {
  return `${values.join("\n")}\n`;
}

const WORKED = lines(
  '{"trace":"t1","id":"a","parent":"","name":"GET /users","start":0,"end":1500}',
  '{"trace":"t1","id":"b","parent":"a","name":"auth","start":100,"end":300}',
  '{"trace":"t1","id":"c","parent":null,"name":"cleanup","start":2000,"end":2100}',
);
const WITHOUT_PARENT = WORKED.replace(',"parent":""', "");

function invoke(args: string[], text: string): Result {
  let out = "";
  let err = "";
  const bytes = enc.encode(text);
  const io: Io = {
    readStdin: () => new Uint8Array(),
    readFile: (path: string) => {
      if (path !== FILE) throw new Error("ENOENT");
      return bytes;
    },
    out: (value: string) => {
      out += value;
    },
    err: (value: string) => {
      err += value;
    },
  };
  const code = runCli(args, io);
  return { code, out, err };
}

describe("empty parent roots", () => {
  test("parseSpans normalizes an empty parent and commands match an omitted parent", () => {
    expect(parseSpans(WORKED, FILE)).toEqual(parseSpans(WITHOUT_PARENT, FILE));
    expect(parseSpans(WORKED, FILE)[0]?.parent).toBeNull();

    for (const command of ["tree", "check", "folded", "top"]) {
      expect(invoke([command, FILE], WORKED)).toEqual(invoke([command, FILE], WITHOUT_PARENT));
    }
  });

  test("tree renders the worked example without a warning", () => {
    expect(invoke(["tree", FILE], WORKED)).toEqual({
      code: 0,
      out: lines(
        "trace t1 (3 spans)",
        "  GET /users 1500us (self 1300us)",
        "    auth 200us (self 200us)",
        "  cleanup 100us (self 100us)",
      ),
      err: "",
    });
  });

  test("check accepts the worked example without a warning", () => {
    expect(invoke(["check", FILE], WORKED)).toEqual({
      code: 0,
      out: "spans.jsonl: ok, 3 spans in 1 trace\n",
      err: "",
    });
  });

  test("folded renders the worked example and top accepts its empty-parent root", () => {
    expect(invoke(["folded", FILE], WORKED)).toEqual({
      code: 0,
      out: lines("GET /users 1300", "GET /users;auth 200", "cleanup 100"),
      err: "",
    });
    const top = invoke(["top", FILE], WORKED);
    expect(top.code).toBe(0);
    expect(top.err).toBe("");
  });

  test("a one-space parent remains an ordinary missing id", () => {
    const text = lines('{"trace":"t","id":"a","parent":" ","name":"n","start":0,"end":1}');
    expect(invoke(["check", FILE], text)).toEqual({
      code: 1,
      out: 'spans.jsonl:1: SF002 parent " " of span "a" not found in trace "t"\n',
      err: "",
    });
  });

  test("non-string parent values keep the input error", () => {
    for (const parent of [5, true, [], {}, false]) {
      const text = lines(
        `{"trace":"t","id":"a","parent":${JSON.stringify(parent)},"name":"n","start":0,"end":1}`,
      );
      expect(invoke(["check", FILE], text)).toEqual({
        code: 2,
        out: "",
        err: 'spanflame: spans.jsonl:1: "parent" must be a non-empty string or null\n',
      });
    }
  });
});
