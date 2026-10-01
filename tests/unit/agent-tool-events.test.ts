import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRefreshFolderTree } from "../../src/components/agent-tool-events";

describe("shouldRefreshFolderTree", () => {
  it("refreshes after create_folder / create_document execute", () => {
    assert.equal(shouldRefreshFolderTree("create_folder", "executed"), true);
    assert.equal(shouldRefreshFolderTree("create_document", "executed"), true);
  });

  it("does not refresh on pending confirmation or errors", () => {
    assert.equal(
      shouldRefreshFolderTree("create_folder", "pending_confirmation"),
      false,
    );
    assert.equal(shouldRefreshFolderTree("create_document", "error"), false);
  });

  it("does not refresh for generate_* or list tools", () => {
    assert.equal(
      shouldRefreshFolderTree("generate_form", "executed"),
      false,
    );
    assert.equal(
      shouldRefreshFolderTree("generate_schedule", "executed"),
      false,
    );
    assert.equal(shouldRefreshFolderTree("list_due", "executed"), false);
  });
});
