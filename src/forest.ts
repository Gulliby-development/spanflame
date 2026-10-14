import { escapeText } from "./text";
import { selfTime } from "./timing";
import type { Node, Problem, Span, Trace } from "./types";

function byStartThenLine(a: Node, b: Node): number {
  return a.span.start - b.span.start || a.span.line - b.span.line;
}

function buildTrace(id: string, spans: Span[]): Trace {
  const problems: Problem[] = [];
  const nodes = new Map<string, Node>();
  const ordered: Node[] = [];
  const tid = escapeText(id);

  for (const span of spans) {
    const first = nodes.get(span.id);
    if (first) {
      problems.push({
        line: span.line,
        code: "SF001",
        message: `duplicate span id "${escapeText(span.id)}" in trace "${tid}" (first on line ${first.span.line})`,
      });
      continue;
    }
    const node: Node = { span, children: [], total: span.end - span.start, self: 0 };
    nodes.set(span.id, node);
    ordered.push(node);
  }

  const roots: Node[] = [];
  for (const node of ordered) {
    const parentId = node.span.parent;
    if (parentId === null) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      problems.push({
        line: node.span.line,
        code: "SF002",
        message: `parent "${escapeText(parentId)}" of span "${escapeText(node.span.id)}" not found in trace "${tid}"`,
      });
      roots.push(node);
    }
  }

  roots.sort(byStartThenLine);
  for (const node of ordered) {
    node.children.sort(byStartThenLine);
  }

  const reached = new Set<Node>();
  const stack: Node[] = [...roots].reverse();
  while (stack.length > 0) {
    const node = stack.pop() as Node;
    reached.add(node);
    node.self = selfTime(
      node.span.start,
      node.span.end,
      node.children.map((c) => [c.span.start, c.span.end]),
    );
    for (const child of node.children) {
      if (child.span.start < node.span.start || child.span.end > node.span.end) {
        problems.push({
          line: child.span.line,
          code: "SF004",
          message: `span "${escapeText(child.span.id)}" (${child.span.start}-${child.span.end}) is not inside its parent "${escapeText(node.span.id)}" (${node.span.start}-${node.span.end})`,
        });
      }
    }
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i] as Node);
    }
  }

  const state = new Map<Node, number>();
  const parentOf = (n: Node): Node | undefined =>
    n.span.parent === null ? undefined : nodes.get(n.span.parent);
  for (const start of ordered) {
    if (reached.has(start) || state.has(start)) continue;
    const path: Node[] = [];
    let cur: Node | undefined = start;
    while (cur && !state.has(cur)) {
      state.set(cur, 1);
      path.push(cur);
      cur = parentOf(cur);
    }
    if (cur && state.get(cur) === 1) {
      const members = path.slice(path.indexOf(cur));
      let head = members[0] as Node;
      for (const m of members) {
        if (m.span.line < head.span.line) head = m;
      }
      const ids = [escapeText(head.span.id)];
      let next = parentOf(head);
      while (next && next !== head) {
        ids.push(escapeText(next.span.id));
        next = parentOf(next);
      }
      ids.push(escapeText(head.span.id));
      problems.push({
        line: head.span.line,
        code: "SF003",
        message: `parent cycle in trace "${tid}": "${ids.join('" -> "')}"`,
      });
    }
    for (const n of path) state.set(n, 2);
  }

  problems.sort((a, b) => a.line - b.line);
  return { id, spanCount: spans.length, roots, shown: reached.size, problems };
}

export function buildForest(spans: Span[]): Trace[] {
  const groups = new Map<string, Span[]>();
  for (const span of spans) {
    const list = groups.get(span.trace);
    if (list) list.push(span);
    else groups.set(span.trace, [span]);
  }
  const traces: Trace[] = [];
  for (const [id, list] of groups) {
    traces.push(buildTrace(id, list));
  }
  return traces;
}
