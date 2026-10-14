import { escapeText, formatDuration, plural } from "./text";
import type { Node, Trace } from "./types";

export interface TreeOptions {
  unit: "us" | "ms";
  minTotal: number;
}

export function renderTree(traces: Trace[], options: TreeOptions): string {
  const lines: string[] = [];
  traces.forEach((trace, index) => {
    if (index > 0) {
      lines.push("");
    }
    lines.push(`trace ${escapeText(trace.id)} (${plural(trace.shown, "span")})`);
    const stack: [Node, number][] = [];
    for (let i = trace.roots.length - 1; i >= 0; i--) {
      stack.push([trace.roots[i] as Node, 1]);
    }
    while (stack.length > 0) {
      const [node, depth] = stack.pop() as [Node, number];
      if (node.total < options.minTotal) {
        continue;
      }
      const total = formatDuration(node.total, options.unit);
      const self = formatDuration(node.self, options.unit);
      lines.push(`${"  ".repeat(depth)}${escapeText(node.span.name)} ${total} (self ${self})`);
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push([node.children[i] as Node, depth + 1]);
      }
    }
  });
  return lines.map((line) => `${line}\n`).join("");
}
