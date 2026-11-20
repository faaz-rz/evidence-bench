import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("benchmarks actual rankings and drills into a regressed case", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "nDCG@3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regressed 1" })).toBeVisible();
  await page.getByRole("button", { name: "Regressed 1" }).click();
  await page
    .getByRole("button", {
      name: "What happens to collaboration if our card is declined?",
    })
    .click();
  await expect(page.getByText("Expected source IDs: billing")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dense ranking" }),
  ).toBeVisible();
  await page.getByLabel("Candidate", { exact: true }).selectOption("hybrid");
  await page.getByRole("button", { name: "Run benchmark" }).click();
  await expect(page.getByRole("button", { name: "Improved 11" })).toBeVisible();
  const [exported] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export run" }).click(),
  ]);
  const data = JSON.parse(await readFile((await exported.path())!, "utf8"));
  expect(data.comparable).toBe(30);
  expect(data.unsupported).toBe(6);
  expect(data.candidate).toBe("hybrid");
  expect(data.cases.length).toBe(36);
  expect(data.fingerprint).toMatch(/^[0-9a-f]{64}$/);
});

test("shows exact evidence and its trace at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Research agent" }).click();
  await page
    .getByRole("combobox", { name: /Research mode/ })
    .selectOption("browser");
  await page
    .getByLabel("Load a benchmark question")
    .selectOption("What is the grace period for a failed renewal payment?");
  await page.getByRole("button", { name: "Search for evidence" }).click();
  await expect(
    page.getByRole("heading", { name: "Candidate excerpts" }),
  ).toBeVisible();
  await expect(
    page
      .getByText("A failed renewal payment starts a seven-day grace period.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Execution trace" }),
  ).toBeVisible();
  await page.getByText("View source with highlighted excerpt").first().click();
  await expect(page.locator("mark").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("processes imported workspaces and refuses invalid documents", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Corpus", exact: true }).click();
  const chooser = page.getByLabel("Workspace JSON");
  const upload = (content: string) => ({
    name: "test.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  await chooser.setInputFiles(upload('{"name": "Invalid"}'));
  await expect(page.getByRole("alert")).toContainText("Documents must have");
  await chooser.setInputFiles(
    upload(
      JSON.stringify({
        name: "Custom handbook",
        documents: [
          {
            id: "demo",
            title: "Order notes",
            sections: [
              { heading: "Time", text: "Workshop collection opens at 9 AM." },
            ],
          },
        ],
        cases: [
          {
            id: "test",
            kind: "direct",
            question: "When does workshop collection open?",
            relevant: ["demo"],
          },
        ],
      }),
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Custom handbook" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Benchmark", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "All queries 1" }),
  ).toBeVisible();
  await expect(page.getByLabel("Baseline", { exact: true })).toHaveValue(
    "term",
  );
  await expect(page.getByLabel("Candidate", { exact: true })).toHaveValue(
    "bm25",
  );
});

test("replays a model run with multi-source evidence and a recorded abstention", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Research agent" }).click();
  await page.getByRole("button", { name: "Replay trace" }).click();
  await expect(
    page.getByText("Recorded execution from qwen3.5:4b."),
  ).toBeVisible();
  await expect(
    page.getByText(/one-hour initial response target/).first(),
  ).toBeVisible();
  await expect(page.getByText(/every thirty minutes/).first()).toBeVisible();
  await page
    .getByLabel("Load a benchmark question")
    .selectOption(
      "What is the exact cost of one extra gigabyte of attachment storage?",
    );
  await page.getByRole("button", { name: "Replay trace" }).click();
  await expect(
    page.getByText("No supporting excerpts were returned."),
  ).toBeVisible();
  await expect(
    page.getByText("Abstained without emitting an unsupported answer."),
  ).toBeVisible();
});
