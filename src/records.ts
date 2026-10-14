import { InputError, type Span } from "./types";

const BLANK = /^[ \t\r]*$/;
const MAX_TIME = 1000000000;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isWhole(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_TIME;
}

function checkLine(value: unknown, line: number): Span | string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "not a JSON object";
  }
  const { trace, id, name, parent, start, end } = value as Record<string, unknown>;
  if (!isNonEmptyString(trace)) return '"trace" must be a non-empty string';
  if (!isNonEmptyString(id)) return '"id" must be a non-empty string';
  if (!isNonEmptyString(name)) return '"name" must be a non-empty string';
  if (parent !== undefined && parent !== null && !isNonEmptyString(parent)) {
    return '"parent" must be a non-empty string or null';
  }
  if (!isWhole(start)) return '"start" must be a whole number from 0 to 1000000000';
  if (!isWhole(end)) return '"end" must be a whole number from 0 to 1000000000';
  if (end < start) return '"end" is before "start"';
  return { trace, id, parent: parent ?? null, name, start, end, line };
}

export function parseSpans(text: string, display: string): Span[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split("\n");
  const spans: Span[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (BLANK.test(raw)) continue;
    const line = i + 1;
    const content = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new InputError(`${display}:${line}: invalid JSON`);
    }
    const result = checkLine(value, line);
    if (typeof result === "string") {
      throw new InputError(`${display}:${line}: ${result}`);
    }
    spans.push(result);
  }
  return spans;
}
