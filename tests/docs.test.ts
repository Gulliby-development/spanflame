import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readme = readFileSync(join(import.meta.dir, "..", "README.md"), "utf8").replace(
  /\r\n/g,
  "\n",
);

function fenced(lines: string[]): string {
  return `\`\`\`\n${lines.join("\n")}\n\`\`\`\n`;
}

const usage = fenced([
  "usage: spanflame tree [--trace ID] [--unit us|ms] [--min-total N] FILE",
  "       spanflame folded [--trace ID] FILE",
  "       spanflame top [--trace ID] [--unit us|ms] [--limit N] FILE",
  "       spanflame check [--trace ID] FILE",
]);

const traceFile = fenced([
  '{"trace":"t1","id":"a","name":"GET /users","start":0,"end":1500}',
  '{"trace":"t1","id":"b","parent":"a","name":"auth","start":100,"end":300}',
  '{"trace":"t1","id":"c","parent":"a","name":"db.query","start":300,"end":1200}',
  '{"trace":"t1","id":"d","parent":"c","name":"db.fetch","start":400,"end":900}',
  '{"trace":"t1","id":"e","parent":"c","name":"db.fetch","start":700,"end":1000}',
  "",
  '{"trace":"t2","id":"x","name":"GET /health","start":5000,"end":5100}',
  '{"trace":"t2","id":"y","parent":"x","name":"db.query","start":5010,"end":5060}',
]);

const treeOut = fenced([
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
]);

const foldedOut = fenced([
  "GET /health 50",
  "GET /health;db.query 50",
  "GET /users 400",
  "GET /users;auth 200",
  "GET /users;db.query 300",
  "GET /users;db.query;db.fetch 800",
]);

const topOut = fenced([
  " SELF  COUNT  SHARE  NAME",
  "800us      2  44.4%  db.fetch",
  "400us      1  22.2%  GET /users",
  "350us      2  19.4%  db.query",
  "200us      1  11.1%  auth",
  " 50us      1   2.8%  GET /health",
]);

describe("README.md", () => {
  test("starts with the title", () => {
    expect(readme.startsWith("# spanflame\n")).toBe(true);
  });

  test("contains the four usage lines verbatim", () => {
    expect(readme).toContain(usage);
  });

  test("contains the trace.jsonl block verbatim", () => {
    expect(readme).toContain(traceFile);
  });

  test("contains the tree, folded and top output blocks verbatim", () => {
    expect(readme).toContain(treeOut);
    expect(readme).toContain(foldedOut);
    expect(readme).toContain(topOut);
  });

  test("has the required headings", () => {
    const headings = [
      "## Install",
      "## Usage",
      "## Input format",
      "## Problems",
      "## Exit codes",
      "## Development",
    ];
    const lines = readme.split("\n");
    for (const heading of headings) {
      expect(lines).toContain(heading);
    }
  });

  test("mentions install, run command, problem codes and checks", () => {
    for (const text of [
      "bun install",
      "bun run src/main.ts tree FILE",
      "SF001",
      "SF002",
      "SF003",
      "SF004",
      "bun test",
      "bun run typecheck",
      "bun run lint",
    ]) {
      expect(readme).toContain(text);
    }
  });

  test("documents the exit codes 0, 1 and 2", () => {
    const section = readme.split("## Exit codes")[1] ?? "";
    expect(section).toContain("`0`");
    expect(section).toContain("`1`");
    expect(section).toContain("`2`");
  });
});
