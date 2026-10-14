import { describe, expect, test } from "bun:test";
import { selfTime, unionLength } from "../src/timing";

describe("unionLength", () => {
  test("empty list is 0", () => {
    expect(unionLength([])).toBe(0);
  });

  test("overlapping intervals", () => {
    expect(
      unionLength([
        [0, 10],
        [5, 15],
      ]),
    ).toBe(15);
  });

  test("touching intervals", () => {
    expect(
      unionLength([
        [0, 10],
        [10, 20],
      ]),
    ).toBe(20);
  });

  test("unsorted and nested intervals", () => {
    expect(
      unionLength([
        [20, 30],
        [0, 100],
        [5, 6],
      ]),
    ).toBe(100);
  });

  test("disjoint intervals are summed", () => {
    expect(
      unionLength([
        [0, 10],
        [11, 12],
      ]),
    ).toBe(11);
  });
});

describe("selfTime", () => {
  test("no children", () => {
    expect(selfTime(0, 100, [])).toBe(100);
  });

  test("overlapping children are not counted twice", () => {
    expect(
      selfTime(300, 1200, [
        [400, 900],
        [700, 1000],
      ]),
    ).toBe(300);
  });

  test("child extending outside is clipped", () => {
    expect(selfTime(0, 100, [[10, 150]])).toBe(10);
  });

  test("child entirely outside is ignored", () => {
    expect(selfTime(0, 100, [[200, 300]])).toBe(100);
  });

  test("disjoint children", () => {
    expect(
      selfTime(0, 100, [
        [0, 10],
        [20, 30],
      ]),
    ).toBe(80);
  });

  test("zero-length span", () => {
    expect(selfTime(5, 5, [])).toBe(0);
  });

  test("zero-length child", () => {
    expect(selfTime(0, 100, [[50, 50]])).toBe(100);
  });

  test("child before the parent start is clipped", () => {
    expect(selfTime(50, 100, [[0, 60]])).toBe(40);
  });
});
