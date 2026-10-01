import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EntityTypeEditor } from "./EntityTypeEditor";
import { useAppStore } from "../store/appStore";
import type { EntityTemplate } from "../types/core";

vi.mock("../hooks/useTauri", () => ({
  invokeCreateEntityTemplate: vi.fn(),
  invokeUpdateEntityTemplate: vi.fn(),
  invokeDeleteEntityTemplate: vi.fn(),
}));

import {
  invokeCreateEntityTemplate,
  invokeUpdateEntityTemplate,
  invokeDeleteEntityTemplate,
} from "../hooks/useTauri";

const mockCreate = invokeCreateEntityTemplate as ReturnType<typeof vi.fn>;
const mockUpdate = invokeUpdateEntityTemplate as ReturnType<typeof vi.fn>;
const mockDelete = invokeDeleteEntityTemplate as ReturnType<typeof vi.fn>;

function makeTemplate(overrides: Partial<EntityTemplate> = {}): EntityTemplate {
  return {
    id: "tmpl1",
    name: "Character",
    color: "#8B6FE8",
    fields: [
      { name: "birth_date", label: "Birth Date", field_type: "date", options: null, default_value: null },
    ],
    ...overrides,
  };
}

function resetStore(templates: EntityTemplate[] = [makeTemplate()]) {
  useAppStore.setState({ entityTemplates: templates });
}

describe("EntityTypeEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("lists existing templates with their property count", () => {
    render(<EntityTypeEditor />);
    expect(screen.getByText("Character")).toBeInTheDocument();
    expect(screen.getByText(/1 propert/i)).toBeInTheDocument();
  });

  it("creates a new template", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeTemplate({ id: "tmpl2", name: "Planet", color: "#00FFAA", fields: [] }));
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /add entity type/i }));
    await user.type(screen.getByPlaceholderText(/^name$/i), "Planet");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Planet" })
      );
    });
    await waitFor(() => {
      expect(useAppStore.getState().entityTemplates).toHaveLength(2);
    });
  });

  it("edits an existing template", async () => {
    const user = userEvent.setup();
    mockUpdate.mockResolvedValue(makeTemplate({ name: "Protagonist" }));
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /edit character/i }));
    const nameInput = screen.getByPlaceholderText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Protagonist");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("tmpl1", expect.objectContaining({ name: "Protagonist" }));
    });
    await waitFor(() => {
      expect(useAppStore.getState().entityTemplates[0].name).toBe("Protagonist");
    });
  });

  it("refuses to save a template with a blank property label", async () => {
    const user = userEvent.setup();
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /add entity type/i }));
    await user.type(screen.getByPlaceholderText(/^name$/i), "Planet");
    await user.click(screen.getByRole("button", { name: /add field/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/every property needs a name/i)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses to save a template with two properties of the same name", async () => {
    const user = userEvent.setup();
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /add entity type/i }));
    await user.type(screen.getByPlaceholderText(/^name$/i), "Planet");
    await user.click(screen.getByRole("button", { name: /add field/i }));
    await user.click(screen.getByRole("button", { name: /add field/i }));
    const labels = screen.getAllByPlaceholderText(/property label/i);
    await user.type(labels[0], "Notes");
    await user.type(labels[1], "Notes");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/two properties share the name/i)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("reveals an options input only once a property's type is Select", async () => {
    const user = userEvent.setup();
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /add entity type/i }));
    await user.click(screen.getByRole("button", { name: /add field/i }));
    expect(screen.queryByPlaceholderText(/option a, option b/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "select");

    expect(screen.getByPlaceholderText(/option a, option b/i)).toBeInTheDocument();
  });

  it("sends comma-separated select options as a JSON array when creating", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeTemplate({ id: "tmpl2", name: "Planet" }));
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /add entity type/i }));
    await user.type(screen.getByPlaceholderText(/^name$/i), "Planet");
    await user.click(screen.getByRole("button", { name: /add field/i }));
    await user.type(screen.getByPlaceholderText(/property label/i), "Mood");
    await user.selectOptions(screen.getByRole("combobox"), "select");
    await user.type(screen.getByPlaceholderText(/option a, option b/i), "Happy, Sad , Angry,");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            {
              name: "mood",
              label: "Mood",
              field_type: "select",
              options: JSON.stringify(["Happy", "Sad", "Angry"]),
              default_value: null,
            },
          ],
        })
      );
    });
  });

  it("shows an existing select property's options and sends edits as a JSON array", async () => {
    const user = userEvent.setup();
    resetStore([
      makeTemplate({
        fields: [
          {
            name: "eye_color",
            label: "Eye Color",
            field_type: "select",
            options: JSON.stringify(["Brown", "Blue"]),
            default_value: null,
          },
        ],
      }),
    ]);
    mockUpdate.mockResolvedValue(makeTemplate());
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /edit character/i }));
    const optionsInput = screen.getByPlaceholderText(/option a, option b/i);
    expect(optionsInput).toHaveValue("Brown, Blue");
    await user.type(optionsInput, ", Green");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        "tmpl1",
        expect.objectContaining({
          fields: [expect.objectContaining({ options: JSON.stringify(["Brown", "Blue", "Green"]) })],
        })
      );
    });
  });

  it("shows the remaining select property's own options after removing another one", async () => {
    const user = userEvent.setup();
    resetStore([
      makeTemplate({
        fields: [
          { name: "mood", label: "Mood", field_type: "select", options: JSON.stringify(["Happy"]), default_value: null },
          { name: "size", label: "Size", field_type: "select", options: JSON.stringify(["Small", "Large"]), default_value: null },
        ],
      }),
    ]);
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /edit character/i }));
    await user.click(screen.getByRole("button", { name: /remove property mood/i }));

    expect(screen.getByPlaceholderText(/option a, option b/i)).toHaveValue("Small, Large");
  });

  it("clears a property's options when its type changes", async () => {
    const user = userEvent.setup();
    resetStore([
      makeTemplate({
        fields: [
          { name: "height", label: "Height", field_type: "number", options: JSON.stringify({ unit: "cm" }), default_value: null },
          { name: "eye_color", label: "Eye Color", field_type: "select", options: JSON.stringify(["Brown"]), default_value: null },
        ],
      }),
    ]);
    mockUpdate.mockResolvedValue(makeTemplate());
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /edit character/i }));
    const [heightType, eyeColorType] = screen.getAllByRole("combobox");
    await user.selectOptions(heightType, "select");
    await user.selectOptions(eyeColorType, "text");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        "tmpl1",
        expect.objectContaining({
          fields: [
            expect.objectContaining({ name: "height", field_type: "select", options: null }),
            expect.objectContaining({ name: "eye_color", field_type: "text", options: null }),
          ],
        })
      );
    });
  });

  it("deletes a template after confirming", async () => {
    const user = userEvent.setup();
    mockDelete.mockResolvedValue(undefined);
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /delete character/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("tmpl1");
    });
    await waitFor(() => {
      expect(useAppStore.getState().entityTemplates).toHaveLength(0);
    });
  });

  it("keeps the template and shows an error when deleting fails", async () => {
    const user = userEvent.setup();
    mockDelete.mockRejectedValue(new Error("disk full"));
    render(<EntityTypeEditor />);

    await user.click(screen.getByRole("button", { name: /delete character/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(await screen.findByText(/unable to delete entity type/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    expect(useAppStore.getState().entityTemplates).toHaveLength(1);
  });
});
