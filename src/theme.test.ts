import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "./ui/theme.js";

test("theme preference accepts only light, dark, or system", () => {
  assert.equal(normalizeThemePreference("light"), "light");
  assert.equal(normalizeThemePreference("dark"), "dark");
  assert.equal(normalizeThemePreference("system"), "system");
  assert.equal(normalizeThemePreference("unknown"), "system");
  assert.equal(normalizeThemePreference(null), "system");
});

test("system theme follows the operating-system color scheme", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("light", true), "light");
});

test("stored theme is defensive when storage is absent, invalid, or throws", () => {
  assert.equal(readThemePreference(), "system");
  assert.equal(readThemePreference({ getItem: (key) => key === THEME_STORAGE_KEY ? "dark" : null }), "dark");
  assert.equal(readThemePreference({ getItem: () => "sepia" }), "system");
  assert.equal(readThemePreference({ getItem: () => { throw new Error("blocked"); } }), "system");
});
