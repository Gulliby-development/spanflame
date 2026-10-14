export type Interval = [number, number];

export function unionLength(intervals: Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let total = 0;
  let curStart = 0;
  let curEnd = 0;
  let open = false;
  for (const [s, e] of sorted) {
    if (!open) {
      curStart = s;
      curEnd = e;
      open = true;
    } else if (s <= curEnd) {
      if (e > curEnd) {
        curEnd = e;
      }
    } else {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  if (open) {
    total += curEnd - curStart;
  }
  return total;
}

export function selfTime(start: number, end: number, children: Interval[]): number {
  const clipped: Interval[] = [];
  for (const [s, e] of children) {
    const cs = Math.max(s, start);
    const ce = Math.min(e, end);
    if (ce > cs) {
      clipped.push([cs, ce]);
    }
  }
  return end - start - unionLength(clipped);
}
