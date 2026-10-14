export function escapeText(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      out += s[i];
    }
  }
  return out;
}

export function formatDuration(us: number, unit: "us" | "ms"): string {
  if (unit === "us") {
    return `${us}us`;
  }
  const whole = Math.floor(us / 1000);
  const rest = us - whole * 1000;
  return `${whole}.${String(rest).padStart(3, "0")}ms`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function displayPath(path: string): string {
  if (path === "-") {
    return "<stdin>";
  }
  return path.replace(/\\/g, "/");
}
