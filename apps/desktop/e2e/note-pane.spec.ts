import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, readFile, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { launchApp } from "./helpers/app";

/**
 * The note editor, driven as a user meets it.
 *
 * The unit suites cover serialization and the component tree in isolation. What
 * only shows up here is whether typing in a real pane reaches a real file on
 * disk in the format we intend — the defect that prompted this overhaul (every
 * note silently stopping saving the first time a table, callout or strikethrough
 * was used) was invisible to every test that stopped short of the filesystem.
 *
 * One test with steps rather than several: each stage builds on the document the
 * last one left behind, and splitting them into independent tests would only
 * pretend otherwise.
 */

let app: ElectronApplication;
let page: Page;
let userDataDir: string;

/**
 * The editor of the *active* tab.
 *
 * Inactive tab layers stay mounted under `display: none`, so an unscoped
 * locator matches every note pane the group has ever shown.
 */
function editor() {
  return page.locator(".note-pane [data-slate-editor]:visible");
}

function footer() {
  return page.locator(".note-pane:visible").getByText(/\d+ words/);
}

async function firstNoteFile(notesDir: string): Promise<string> {
  const file = (await readdir(notesDir)).find((entry) => entry.endsWith(".md"));
  if (!file) throw new Error(`No note written to ${notesDir}`);
  return file;
}

/** The markdown the app has written for this pane's note, once it lands. */
async function waitForNoteOnDisk(contains: string): Promise<string> {
  const notesDir = join(userDataDir, "notes");

  await expect
    .poll(
      async () => {
        try {
          return await readFile(join(notesDir, await firstNoteFile(notesDir)), "utf-8");
        } catch {
          return "";
        }
      },
      { timeout: 15_000 },
    )
    .toContain(contains);

  return readFile(join(notesDir, await firstNoteFile(notesDir)), "utf-8");
}

async function openNotePane(): Promise<void> {
  await page.evaluate(() => {
    const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as {
      getState: () => {
        activeWorkspaceId: string;
        workspaces: { id: string; focusedGroupId?: string }[];
        addGroupTab: (workspaceId: string, groupId: string, defaultType: string) => void;
      };
    };
    const state = store.getState();
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId)!;
    state.addGroupTab(ws.id, ws.focusedGroupId!, "note");
  });

  await expect(editor()).toBeVisible({ timeout: 20_000 });
}

test.beforeAll(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), "devspace-note-e2e-"));
  ({ app, page } = await launchApp({ env: { DEVSPACE_USER_DATA_PATH: userDataDir } }));
});

test.afterAll(async () => {
  await app?.close();
  await rm(userDataDir, { recursive: true, force: true });
});

test("a note pane edits, saves and reloads round-trippable markdown", async () => {
  test.setTimeout(120_000);

  await test.step("opens and renders", async () => {
    await openNotePane();
    await expect(page.getByText("Note editor failed to load")).toHaveCount(0);
  });

  await test.step("typing reaches disk as markdown", async () => {
    // One continuous run, the way it is actually typed. Autoformat only fires
    // at the start of a block, so `- [ ] ` has to be typed there.
    await editor().click();
    await page.keyboard.type("# Sprint notes");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Deploy is gated on CI.");

    await expect(editor().locator("h1")).toHaveText("Sprint notes");

    const markdown = await waitForNoteOnDisk("Deploy is gated on CI.");
    expect(markdown).toContain("# Sprint notes");
  });

  await test.step("the footer reports live counts", async () => {
    await expect(footer()).toBeVisible();
    await expect(page.locator(".note-pane").getByText("Saved")).toBeVisible();
  });

  await test.step("the blocks that used to break saving now round trip", async () => {
    // Each of these threw inside `serialize()` before the markdown layer was
    // configured with GFM, and a single throw stopped the pane saving for good.
    await page.keyboard.press("Enter");
    await page.keyboard.type("- [ ] fix save bug");
    await page.keyboard.press("Enter");
    await page.keyboard.type("~~struck~~ text");

    const markdown = await waitForNoteOnDisk("~~struck~~");
    // `- [ ] ` is the spelling everyone types; it has to make a real checkbox
    // rather than a bullet containing a literal "[ ]".
    expect(markdown).toContain("- [ ] fix save bug");
    // Nothing earlier was dropped on the way.
    expect(markdown).toContain("# Sprint notes");
    expect(markdown).toContain("Deploy is gated on CI.");
  });

  await test.step("the slash menu shows a selection and inserts a callout", async () => {
    await page.keyboard.press("Enter");
    await page.keyboard.type("/callout");

    // The scaffold rendered this list with no hover and no active-item styling,
    // so there was no way to tell what Enter would commit.
    const activeItem = page.locator('[role="option"][data-active-item="true"]');
    await expect(activeItem).toBeVisible({ timeout: 5_000 });
    await expect(activeItem).toContainText("Callout");

    await page.keyboard.press("Enter");
    await page.keyboard.type("Remember the cache");

    expect(await waitForNoteOnDisk("> [!NOTE]")).toContain("Remember the cache");
  });

  await test.step("the outline lists the note's headings", async () => {
    await page.locator('.note-pane [aria-label="Show outline"]').click();
    await expect(
      page.locator(".note-pane").getByRole("button", { exact: true, name: "Sprint notes" }),
    ).toBeVisible();
    await page.locator('.note-pane [aria-label="Hide outline"]').click();
  });

  await test.step("the find shortcut routes to the note pane", async () => {
    await editor().click();

    // ⌘F is an application-menu accelerator: the main process sends the action
    // channel and the renderer routes it to whichever pane type has focus.
    // A DOM keypress never reaches the native menu, so the accelerator's own
    // IPC send is what has to be reproduced here.
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow());
      window?.webContents.send("app:browser-find");
    });

    const findInput = page.getByPlaceholder("Find in note");
    await expect(findInput).toBeFocused({ timeout: 5_000 });

    await findInput.fill("Deploy");
    await expect(page.locator(".note-pane").getByText("1 / 1")).toBeVisible();

    await findInput.press("Escape");
    await expect(findInput).toHaveCount(0);
  });

  await test.step("reloading the note reproduces what was written", async () => {
    const noteFile = await firstNoteFile(join(userDataDir, "notes"));
    const markdown = await readFile(join(userDataDir, "notes", noteFile), "utf-8");

    // Re-mount the pane by switching tabs away and back, which forces a fresh
    // load from disk through the same deserializer.
    await page.reload();
    await page.waitForSelector(".app-shell", { timeout: 30_000 });
    await expect(editor()).toBeVisible({ timeout: 20_000 });

    await expect(editor().locator("h1")).toHaveText("Sprint notes");
    await expect(editor()).toContainText("Remember the cache");
    await expect(editor()).toContainText("fix save bug");

    // And nothing was rewritten just by opening it.
    expect(await readFile(join(userDataDir, "notes", noteFile), "utf-8")).toBe(markdown);
  });
});

test("a note ending in a code block can still be typed under", async () => {
  // A code block was a dead end: clicking below it put the caret inside the
  // code, so the note could not be continued.
  await openNotePane();

  await editor().click();
  await page.keyboard.type("```");
  await page.keyboard.type("const a = 1;");
  await expect(editor().locator("pre")).toBeVisible();

  // Click the empty space under the last block, the way a user would.
  const box = (await editor().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20);
  await page.keyboard.type("after the code");

  await expect(editor()).toContainText("after the code");
  // And the text landed outside the code block, not inside it.
  await expect(editor().locator("pre")).not.toContainText("after the code");
});

test("a block can be dragged by its handle", async () => {
  await openNotePane();

  await editor().click();
  await page.keyboard.type("first");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");

  const blocks = () => editor().locator(":scope > div");
  await expect(blocks().first()).toContainText("first");

  // Hover the first block to reveal its gutter, then drag it past the second.
  const first = blocks().first();
  await first.hover();
  const handle = first.locator('button[aria-label="Drag to move, click to open block menu"]');
  await expect(handle).toBeVisible();

  await handle.dragTo(blocks().nth(1), { targetPosition: { x: 20, y: 18 } });

  await expect(blocks().first()).toContainText("second");
  await expect(blocks().nth(1)).toContainText("first");
});

test("a second note pane opens, and switching back keeps the first alive", async () => {
  const firstTab = page.locator('[data-sortable-id^="gtab-"]').filter({ hasText: "Sprint notes" });

  await page.evaluate(() => {
    const store = (window as unknown as Record<string, unknown>).__DEVSPACE_STORE__ as {
      getState: () => {
        activeWorkspaceId: string;
        workspaces: { id: string; focusedGroupId?: string }[];
        addGroupTab: (workspaceId: string, groupId: string, defaultType: string) => void;
      };
    };
    const state = store.getState();
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId)!;
    state.addGroupTab(ws.id, ws.focusedGroupId!, "note");
  });

  // The new, empty note.
  await expect(editor()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Note editor failed to load")).toHaveCount(0);
  await editor().click();
  await page.keyboard.type("Second note");
  await expect(editor()).toContainText("Second note");

  // Both panes are mounted at once — the inactive layer is hidden, not
  // unmounted — which is the case react-dnd's single HTML5 backend has to
  // survive, and the one that would put a pane behind the error boundary.
  expect(
    await page.evaluate(() => document.querySelectorAll("[data-slate-editor]").length),
  ).toBeGreaterThanOrEqual(2);

  await firstTab.click();
  await expect(editor()).toContainText("Sprint notes", { timeout: 10_000 });
  await expect(page.getByText("Note editor failed to load")).toHaveCount(0);
});
