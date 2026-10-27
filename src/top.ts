import { escapeText, formatDuration } from "./text";
import type { Node, Trace } from "./types";

export interface TopOptions {
  unit: "us" | "ms";
  limit: number;
}

interface Row {
  name: string;
  self: number;
  count: number;
}

function formatShare(self: number, total: bigint): string {
  if (total === 0n) {
    return "0.0%";
  }
  const tenths = (2n * BigInt(self) * 1000n + total) / (2n * total);
  if (tenths === 0n && self > 0) {
    return "<0.1%";
  }
  return `${tenths / 10n}.${tenths % 10n}%`;
}

export function renderTop(traces: Trace[], options: TopOptions): string {
  const byName = new Map<string, Row>();
  let total = 0n;
  for (const trace of traces) {
    const stack: Node[] = [...trace.roots];
    while (stack.length > 0) {
      const node = stack.pop() as Node;
      const name = escapeText(node.span.name);
      let row = byName.get(name);
      if (row === undefined) {
        row = { name, self: 0, count: 0 };
        byName.set(name, row);
      }
      row.self += node.self;
      row.count += 1;
      total += BigInt(node.self);
      for (const child of node.children) {
        stack.push(child);
      }
    }
  }
  const rows = [...byName.values()].sort((a, b) => {
    if (a.self !== b.self) {
      return b.self - a.self;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  const cells: string[][] = [["SELF", "COUNT", "SHARE", "NAME"]];
  for (const row of rows.slice(0, options.limit)) {
    cells.push([
      formatDuration(row.self, options.unit),
      String(row.count),
      formatShare(row.self, total),
      row.name,
    ]);
  }
  const widths = [0, 1, 2].map((c) => Math.max(...cells.map((r) => (r[c] as string).length)));
  return cells
    .map((r) => {
      const padded = widths.map((w, c) => (r[c] as string).padStart(w));
      return `${padded.join("  ")}  ${r[3]}\n`;
    })
    .join("");
}
