import { describe, expect, it } from "vitest";
import { mockInvoke } from "../test/mocks/tauri";
import { invokeExportBook } from "./useTauri";

describe("invokeExportBook", () => {
  it("invokes export_book with the project id, format, and destination path", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await invokeExportBook("proj-1", "epub", "/tmp/book.epub");

    expect(mockInvoke).toHaveBeenCalledWith("export_book", {
      projectId: "proj-1",
      format: "epub",
      destPath: "/tmp/book.epub",
    });
  });
});
