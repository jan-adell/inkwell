import { test, expect } from "@playwright/test";

test("dark theme renders correctly — background and text colors", async ({ page }) => {
  await page.goto("/");

  // Body background must be the ink-void dark token (#0a0b0f).
  // A white or near-white value here means color-scheme auto-conversion fired.
  const bgColor = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  );
  // rgb(10, 11, 15) is #0a0b0f
  expect(bgColor).toBe("rgb(10, 11, 15)");

  // Body text must be the ivory token (#f0ead6 → rgb(240, 234, 214)).
  const textColor = await page.evaluate(() =>
    getComputedStyle(document.body).color
  );
  expect(textColor).toBe("rgb(240, 234, 214)");

  // color-scheme must be declared as dark so WebView2 does not auto-invert.
  const colorScheme = await page.evaluate(() =>
    getComputedStyle(document.documentElement).colorScheme
  );
  expect(colorScheme).toBe("dark");

  // Capture a screenshot as a CI artifact for visual inspection.
  await page.screenshot({ path: "test-results/theme-screenshot.png", fullPage: false });
});
