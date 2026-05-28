// @ts-ignore vitest types aren't in the api package's tsconfig; shared
// tests run under vitest (frontend) — same convention as the other tests.
import { expect, test } from "vitest";
import { analyzeComp, basePercent } from "../comp-analyzer.js";

test("annualizes equity over the vesting period", () => {
  const b = analyzeComp({ baseSalary: 300000, equityGrantValue: 1200000, vestingYears: 4 });
  expect(b.annualEquity).toBe(300000); // 1.2M / 4
  expect(b.annualizedTotal).toBe(600000); // 300k base + 300k equity
});

test("amortizes sign-on across vesting; year-1 counts it in full", () => {
  const b = analyzeComp({ baseSalary: 200000, signOnBonus: 100000, vestingYears: 4 });
  expect(b.annualizedSignOn).toBe(25000); // 100k / 4
  expect(b.annualizedTotal).toBe(225000);
  expect(b.yearOneTotal).toBe(300000); // base + full sign-on
});

test("composition shares sum to ~1", () => {
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
  expect(sum).toBeCloseTo(1, 5);
});

test("basePercent flags equity-heavy exec packages", () => {
  // 250k base out of 650k annualized → ~38%, an equity/bonus-heavy package.
  const b = analyzeComp({ baseSalary: 250000, targetBonus: 150000, equityGrantValue: 1000000, vestingYears: 4 });
  expect(basePercent(b)).toBe(38);
});

test("defaults vesting to 4 years and ignores negatives", () => {
  const b = analyzeComp({ baseSalary: 100000, equityGrantValue: 400000, targetBonus: -50 });
  expect(b.annualEquity).toBe(100000); // 400k / 4 default
  expect(b.targetBonus).toBe(0); // negative ignored
});

test("zero input yields zero total + zero shares (no divide-by-zero)", () => {
  const b = analyzeComp({ baseSalary: 0 });
  expect(b.annualizedTotal).toBe(0);
  expect(b.composition.base).toBe(0);
});
