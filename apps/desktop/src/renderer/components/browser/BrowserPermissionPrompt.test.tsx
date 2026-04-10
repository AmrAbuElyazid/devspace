import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BrowserPermissionPrompt from "./BrowserPermissionPrompt";

test("renders the permission request origin and decision actions", () => {
  const html = renderToStaticMarkup(
    <BrowserPermissionPrompt
      request={{
        paneId: "pane-1",
        origin: "https://camera.example",
        permissionType: "camera",
        requestToken: "token-1",
      }}
      onDecision={() => {}}
      onDismiss={() => {}}
    />,
  );

  expect(html).toContain("https://camera.example");
  expect(html).toContain("Camera");
  expect(html).toContain("Allow once");
  expect(html).toContain("Allow for session");
  expect(html).toContain("Deny");
});

test("renders a readable label for non-media Electron permissions", () => {
  const html = renderToStaticMarkup(
    <BrowserPermissionPrompt
      request={{
        paneId: "pane-1",
        origin: "https://auth.example",
        permissionType: "storage-access",
        requestToken: "token-1",
      }}
      onDecision={() => {}}
      onDismiss={() => {}}
    />,
  );

  expect(html).toContain("https://auth.example");
  expect(html).toContain("Storage Access");
  expect(html).toContain("requesting storage access permission");
});
