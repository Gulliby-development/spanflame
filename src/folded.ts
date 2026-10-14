import { escapeText } from "./text";
import type { Node, Trace } from "./types";

export function renderFolded(traces: Trace[]): string {
  const weights = new Map<string, number>();
  for (const trace of traces) {
    const stack: [Node, string][] = [];
    for (let i = trace.roots.length - 1; i >= 0; i--) {
      stack.push([trace.roots[i] as Node, ""]);
    }
    while (stack.length > 0) {
      const [node, prefix] = stack.pop() as [Node, string];
      const name = escapeText(node.span.name).replace(/;/g, "_");
      const path = prefix === "" ? name : `${prefix};${name}`;
      weights.set(path, (weights.get(path) ?? 0) + node.self);
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push([node.children[i] as Node, path]);
      }
    }
  }
  const keys: string[] = [];
  for (const [key, weight] of weights) {
    if (weight > 0) {
      keys.push(key);
    }
  }
  keys.sort();
  return keys.map((key) => `${key} ${weights.get(key)}\n`).join("");
}
