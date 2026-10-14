export interface Span {
  trace: string;
  id: string;
  parent: string | null;
  name: string;
  start: number;
  end: number;
  line: number;
}

export interface Node {
  span: Span;
  children: Node[];
  total: number;
  self: number;
}

export interface Problem {
  line: number;
  code: "SF001" | "SF002" | "SF003" | "SF004";
  message: string;
}

export interface Trace {
  id: string;
  spanCount: number;
  roots: Node[];
  shown: number;
  problems: Problem[];
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}
