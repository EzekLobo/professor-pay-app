import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getRenderableTutorialSteps, getTutorialForPathname, tutorialSessionKey, tutorials } from "./tutorials";
import { isTutorialVersionCompleted } from "./tutorial-progress";

describe("tutorial definitions", () => {
  it("defines unique ids, paths, targets, valid versions and an introduction for every route", () => {
    expect(new Set(tutorials.map((tutorial) => tutorial.id)).size).toBe(tutorials.length);
    expect(new Set(tutorials.map((tutorial) => tutorial.pathname)).size).toBe(tutorials.length);

    const targetedSteps = tutorials.flatMap((tutorial) => tutorial.steps.filter((step) => step.target));
    const targets = targetedSteps.map((step) => step.target!);
    expect(new Set(targets).size).toBe(targets.length);

    for (const tutorial of tutorials) {
      expect(tutorial.version).toBeGreaterThan(0);
      expect(tutorial.steps[0]?.target).toBeUndefined();
      expect(tutorial.steps[0]?.placement).toBe("center");
      expect(new Set(tutorial.steps.map((step) => step.id)).size).toBe(tutorial.steps.length);
    }

    for (const target of targets) {
      expect(target).toMatch(/^\[data-tour="[a-z0-9-]+"\]$/);
    }
  });

  it("maps every supported route to its tutorial and rejects unsupported routes", () => {
    for (const tutorial of tutorials) {
      expect(getTutorialForPathname(tutorial.pathname)).toBe(tutorial);
    }
    expect(getTutorialForPathname("/login")).toBeNull();
  });

  it("has exactly one source target for every registered selector", () => {
    const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const collectSource = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectSource(path);
      return entry.name.endsWith(".tsx") ? [readFileSync(path, "utf8")] : [];
    });
    const source = ["app", "components"]
      .flatMap((directory) => collectSource(join(sourceRoot, directory)))
      .join("\n");
    const targetNames = tutorials
      .flatMap((tutorial) => tutorial.steps)
      .flatMap((step) => step.target ? [step.target.match(/^\[data-tour="([a-z0-9-]+)"\]$/)?.[1]] : []);

    for (const targetName of targetNames) {
      expect(targetName).toBeDefined();
      expect(source.split(`"${targetName}"`).length - 1).toBe(1);
    }
  });

  it("filters unavailable targets while keeping untargeted steps", () => {
    const tutorial = getTutorialForPathname("/payments");
    expect(tutorial).not.toBeNull();
    const steps = getRenderableTutorialSteps(tutorial!, (selector) => selector.includes("summary"));
    expect(steps.map((step) => step.id)).toEqual(["welcome", "summary"]);
  });

  it("isolates the in-session completion marker by user and tutorial version", () => {
    const payments = getTutorialForPathname("/payments")!;
    expect(tutorialSessionKey("professor-a", payments)).toBe("professor-a:payments:v1");
    expect(tutorialSessionKey("professor-b", payments)).not.toBe(tutorialSessionKey("professor-a", payments));
    expect(tutorialSessionKey("professor-a", { ...payments, version: payments.version + 1 })).not.toBe(
      tutorialSessionKey("professor-a", payments),
    );
  });
});

describe("tutorial progress", () => {
  it("recognizes the same or a newer completed version", () => {
    expect(isTutorialVersionCompleted({ version: 2 }, 2)).toBe(true);
    expect(isTutorialVersionCompleted({ version: 3 }, 2)).toBe(true);
    expect(isTutorialVersionCompleted({ version: 1 }, 2)).toBe(false);
    expect(isTutorialVersionCompleted(null, 1)).toBe(false);
  });
});
