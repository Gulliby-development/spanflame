import { readFileSync } from "node:fs";
import { type Io, run } from "./cli";

const io: Io = {
  readStdin: () => readFileSync(0),
  readFile: (path: string) => readFileSync(path),
  out: (text: string) => {
    process.stdout.write(text);
  },
  err: (text: string) => {
    process.stderr.write(text);
  },
};

process.exitCode = run(process.argv.slice(2), io);
