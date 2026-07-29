import { expect, test } from "@playwright/test";
import { launchApp } from "./helpers/app";

/**
 * The bundled tmux links a Homebrew libncursesw whose only compiled-in
 * terminfo path is the Cellar directory of the machine that built it. That
 * directory exists on a build machine and on no user's Mac, and ncurses does
 * not consult /usr/share/terminfo unless told to — so a regression here is
 * invisible to every other test in this suite, which all run somewhere the
 * Cellar path happens to exist. Asserting the search path itself is the only
 * check that fails in the same place a user would.
 */
test("main exposes the system terminfo database to spawned terminals", async () => {
  const { app } = await launchApp();

  try {
    const searchPath = await app.evaluate(() => process.env.TERMINFO_DIRS ?? "");

    expect(searchPath.split(":")).toContain("/usr/share/terminfo");
  } finally {
    await app.close();
  }
});
