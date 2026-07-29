/**
 * SEC-3 regression tests — CodeQL js/polynomial-redos (alert #27).
 *
 * netBraceDelta stripped inline block comments with the lazy regex
 * /\/\*.*?\*\//g, which backtracks quadratically on lines with many "a/*"
 * repetitions (measured: 6.9ms -> 117.6ms for a 4x input). A single minified
 * bundle could stall indexing. The replacement stripInlineBlockComments is a
 * single-pass O(n) scan with identical output.
 */

import { describe, expect, it } from "bun:test";
import { netBraceDelta } from "../services/search/chunker/chunker-code.js";

describe("netBraceDelta block-comment stripping", () => {
  it("removes closed block comments before counting braces", () => {
    expect(netBraceDelta("const x = /* { } { */ 1;")).toBe(0);
    expect(netBraceDelta("/* {{ */ if (a) {")).toBe(1);
  });

  it("strips multiple closed spans on one line", () => {
    expect(netBraceDelta("/* { */ code /* } */ {")).toBe(1);
  });

  it("keeps unterminated openers verbatim (old regex parity)", () => {
    // The lazy regex only matched CLOSED pairs; an unterminated /* stayed in
    // the string and its braces counted. Preserve that behavior exactly.
    expect(netBraceDelta("code /* { unterminated")).toBe(1);
    expect(netBraceDelta("code /* no braces here")).toBe(0);
  });

  it("uses the earliest close, like the lazy quantifier did", () => {
    // "/* a */ } */" — lazy match removes "/* a */", leaving " } */" => -1.
    expect(netBraceDelta("/* a */ } */")).toBe(-1);
  });

  it("handles adversarial many-opener input in linear time", () => {
    // CodeQL's exploit shape: "/*" followed by many "a/*" repetitions. At
    // 33k repetitions the old quadratic path took seconds; linear is <10ms.
    // The 500ms budget is a 50x margin over the expected time and far below
    // the old path's cost, so it cannot pass on a quadratic regression.
    const adversarial = "/*" + "a/*".repeat(33_000);
    const start = performance.now();
    const delta = netBraceDelta(adversarial);
    const elapsed = performance.now() - start;
    expect(delta).toBe(0);
    expect(elapsed).toBeLessThan(500);
  });

  it("still counts braces outside comments correctly", () => {
    expect(netBraceDelta("if (a) {")).toBe(1);
    expect(netBraceDelta("}")).toBe(-1);
    expect(netBraceDelta("{}")).toBe(0);
  });
});
