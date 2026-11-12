import { deepStrictEqual, ok } from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import en from "../../src/locales/en.json" with { type: "json" };
import ru from "../../src/locales/ru.json" with { type: "json" };

describe("Localization dictionaries", () => {
  it("English and Russian dictionaries contain exactly the same UI keys", () => {
    deepStrictEqual(Object.keys(en).sort(), Object.keys(ru).sort());
    for (const [key, value] of Object.entries(ru)) {
      ok(typeof value === "string" && value.trim().length > 0, "Empty Russian translation: " + key);
    }
  });

  it("all statically used UI translation keys are present", () => {
    const root = fileURLToPath(new URL("../../src/", import.meta.url));
    const files: string[] = [];
    function collect(folder: string) {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const location = folder + "/" + entry.name;
        if (entry.isDirectory()) collect(location);
        else if (entry.name.endsWith(".svelte") || entry.name.endsWith(".ts")) files.push(location);
      }
    }
    collect(root);
    const missing = new Set<string>();
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
        if (!(match[1] in en) || !(match[1] in ru)) missing.add(match[1]);
      }
    }
    deepStrictEqual([...missing].sort(), [], "Missing UI translation keys");
  });
});
