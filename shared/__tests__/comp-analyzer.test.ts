import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeComp, basePercent } from "../comp-analyzer.js";

describe("analyzeComp", () => {
  it("annualizes equity over the vesting period", () => {
    const b = analyzeComp({ baseSalary: 300000, equityGrantValue: 1200000, vestingYears: 4 });
    assert.equal(b.annualEquity, 300000); // 1.2M / 4
    assert.equal(b.annualizedTotal, 600000); // 300k base + 300k equity
  });

  it("amortizes sign-on across vesting; year-1 counts it in full", () => {
    const b = analyzeComp({ baseSalary: 200000, signOnBonus: 100000, vestingYears: 4 });
    assert.equal(b.annualizedSignOn, 25000); // 100k / 4
    assert.equal(b.annualizedTotal, 225000);
    assert.equal(b.yearOneTotal, 300000); // base + full sign-on
  });

  it("composition shares sum to ~1", () => {
    const b = analyzeComp({
      baseSalary: 250000,
      targetBonus: 125000,
      equityGrantValue: 1000000,
      vestingYears: 4,
      benefitsValue: 25000,
    });
    const sum =
      b.composition.base + b.composition.bonus + b.composition.equity +
      b.composition.signOn + b.composition.benefits;
    assert.ok(Math.abs(sum - 1) < 1e-5);
  });

  it("basePercent flags equity-heavy exec packages", () => {
    // 250k base out of 650k annualized → ~38%, an equity/bonus-heavy package.
    const b = analyzeComp({ baseSalary: 250000, targetBonus: 150000, equityGrantValue: 1000000, vestingYears: 4 });
    assert.equal(basePercent(b), 38);
  });

  it("defaults vesting to 4 years and ignores negatives", () => {
    const b = analyzeComp({ baseSalary: 100000, equityGrantValue: 400000, targetBonus: -50 });
    assert.equal(b.annualEquity, 100000); // 400k / 4 default
    assert.equal(b.targetBonus, 0); // negative ignored
  });

  it("zero input yields zero total + zero shares (no divide-by-zero)", () => {
    const b = analyzeComp({ baseSalary: 0 });
    assert.equal(b.annualizedTotal, 0);
    assert.equal(b.composition.base, 0);
  });
});
