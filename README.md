# spanflame

<p align="center"><img src="docs/logo.svg" width="96" alt="" /></p>

spanflame is a command-line tool for people who profile services with trace data. It reads spans (one JSON object per line: trace id, span id, parent id, name, start and end in microseconds), rebuilds the call tree of every trace and shows where the time went. It works offline and reads the file only.

- `spanflame tree` prints the trees with total and self time (the time not covered by child spans; parallel children are not counted twice).
- `spanflame folded` prints folded stacks, the input of flame graph tools.
- `spanflame top` prints the names with the most self time.
- `spanflame check` reports broken data.

[![CI](https://github.com/Gulliby-development/spanflame/actions/workflows/ci.yml/badge.svg)](https://github.com/Gulliby-development/spanflame/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Install

```
bun install
```

Run it with `bun run src/main.ts tree FILE`. There is no build step.

## Usage

```
usage: spanflame tree [--trace ID] [--unit us|ms] [--min-total N] [--max-depth N] FILE
       spanflame folded [--trace ID] FILE
       spanflame top [--trace ID] [--unit us|ms] [--limit N] FILE
       spanflame check [--trace ID] FILE
```

FILE is a path or `-` for standard input. The file `trace.jsonl` (the last two lines are the second trace, the empty line is skipped):

```
{"trace":"t1","id":"a","name":"GET /users","start":0,"end":1500}
{"trace":"t1","id":"b","parent":"a","name":"auth","start":100,"end":300}
{"trace":"t1","id":"c","parent":"a","name":"db.query","start":300,"end":1200}
{"trace":"t1","id":"d","parent":"c","name":"db.fetch","start":400,"end":900}
{"trace":"t1","id":"e","parent":"c","name":"db.fetch","start":700,"end":1000}

{"trace":"t2","id":"x","name":"GET /health","start":5000,"end":5100}
{"trace":"t2","id":"y","parent":"x","name":"db.query","start":5010,"end":5060}
```

`spanflame tree trace.jsonl` prints the trees. Options: `--trace ID` keeps one trace, `--unit us|ms` chooses the unit, `--min-total N` leaves out spans whose total is below N microseconds, `--max-depth N` leaves out spans below level N.

```
trace t1 (5 spans)
  GET /users 1500us (self 400us)
    auth 200us (self 200us)
    db.query 900us (self 300us)
      db.fetch 500us (self 500us)
      db.fetch 300us (self 300us)

trace t2 (2 spans)
  GET /health 100us (self 50us)
    db.query 50us (self 50us)
```

`--max-depth N` (a whole number from 1 to 1000, `tree` only) keeps the first N levels of every tree: a root is level 1, its children level 2, and a span that is left out takes its children with it. The count in the `trace` heading and the self times stay as they are. `spanflame tree --max-depth 2 trace.jsonl` prints:

```
trace t1 (5 spans)
  GET /users 1500us (self 400us)
    auth 200us (self 200us)
    db.query 900us (self 300us)

trace t2 (2 spans)
  GET /health 100us (self 50us)
    db.query 50us (self 50us)
```

`spanflame folded trace.jsonl` prints folded stacks:

```
GET /health 50
GET /health;db.query 50
GET /users 400
GET /users;auth 200
GET /users;db.query 300
GET /users;db.query;db.fetch 800
```

`spanflame top trace.jsonl` prints the names with the most self time (`--limit N` sets the row count, default 10):

```
 SELF  COUNT  SHARE  NAME
800us      2  44.4%  db.fetch
400us      1  22.2%  GET /users
350us      2  19.4%  db.query
200us      1  11.1%  auth
 50us      1   2.8%  GET /health
```

`spanflame check trace.jsonl` prints one line per problem and exits 1, or a short ok line and exits 0.

## Input format

UTF-8 text, one JSON object per line. Lines end with LF or CRLF, a leading BOM is ignored, and blank lines are skipped. Fields:

- `trace`, `id`, `name`: non-empty strings.
- `parent`: absent, `null` or a non-empty string (absent or `null` is a root).
- `start`, `end`: JSON numbers with a whole value from 0 to 1000000000 (microseconds); `end` must not be below `start`.

Unknown keys are ignored. The first bad line stops the run with exit 2.

## Problems

- `SF001`: duplicate span id in a trace (the later span is left out).
- `SF002`: the parent of a span is not found in its trace (the span becomes a root).
- `SF003`: parent cycle (the spans in and below the cycle are left out).
- `SF004`: a span is not inside its parent.

## Exit codes

- `0`: success (and `check` found nothing).
- `1`: `check` found problems.
- `2`: usage or input error.

## Development

```
bun test
bun run typecheck
bun run lint
```

## License

MIT, see [LICENSE](LICENSE).

---

Built with BAKED.
