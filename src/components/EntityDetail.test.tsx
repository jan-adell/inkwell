import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { PropertyRow } from "./EntityDetail";
import type { Entity, EntityAsset, FieldDefinition, FieldValue, FieldType } from "../types/core";

vi.mock("../hooks/useTauri", () => ({
  invokeSetFieldValue: vi.fn(),
  invokeDeleteFieldDefinition: vi.fn(),
  invokeGetFieldValues: vi.fn(),
  invokeListFieldDefinitions: vi.fn(),
  invokeCreateFieldDefinition: vi.fn(),
  invokeUpdateEntity: vi.fn(),
  invokeAddEntityAsset: vi.fn(),
  invokeReadEntityAsset: vi.fn(),
  invokeDeleteEntityAsset: vi.fn(),
  invokeListEntityAssets: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost${path}`,
}));


import {
  invokeSetFieldValue,
  invokeDeleteFieldDefinition,
  invokeAddEntityAsset,
  invokeReadEntityAsset,
  invokeDeleteEntityAsset,
} from "../hooks/useTauri";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";

const mockSetFieldValue = invokeSetFieldValue as ReturnType<typeof vi.fn>;
const mockDeleteFieldDefinition = invokeDeleteFieldDefinition as ReturnType<typeof vi.fn>;
const mockAddEntityAsset = invokeAddEntityAsset as ReturnType<typeof vi.fn>;
const mockReadEntityAsset = invokeReadEntityAsset as ReturnType<typeof vi.fn>;
const mockDeleteEntityAsset = invokeDeleteEntityAsset as ReturnType<typeof vi.fn>;
const mockDialogOpen = dialogOpen as ReturnType<typeof vi.fn>;

const ENTITY: Entity = {
  id: "e1",
  project_id: "p1",
  entity_type_id: "et1",
  name: "Test Entity",
  summary: null,
  cover_image: null,
  visibility: "private",
  sort_order: 0,
  folder_id: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  deleted_at: null,
};

function makeFieldDef(field_type: FieldType, overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: "fd1",
    entity_type_id: "et1",
    name: "test_field",
    label: "Test Field",
    field_type,
    options: null,
    default_value: null,
    is_required: false,
    visibility: "private",
    sort_order: 0,
    created_at: "2026-01-01",
    deleted_at: null,
    ...overrides,
  };
}

function makeFieldValue(overrides: Partial<FieldValue>): FieldValue {
  return {
    id: "fv1",
    entity_id: "e1",
    field_def_id: "fd1",
    value_text: null,
    value_number: null,
    value_boolean: null,
    value_date: null,
    value_json: null,
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function makeAsset(overrides: Partial<EntityAsset> = {}): EntityAsset {
  return {
    id: "asset1",
    entity_id: "e1",
    relative_path: "assets/entities/e1/ULID.jpg",
    label: "fd1",
    sort_order: 0,
    created_at: "2026-01-01",
    ...overrides,
  };
}

function setup(field_type: FieldType, fieldValue?: FieldValue, asset?: EntityAsset) {
  const onDeleted = vi.fn();
  const onSaved = vi.fn();
  const onAssetChanged = vi.fn();
  const user = userEvent.setup();
  mockSetFieldValue.mockResolvedValue(makeFieldValue({}));
  mockReadEntityAsset.mockResolvedValue("data:image/jpeg;base64,/9j/fake");
  render(
    <PropertyRow
      fieldDef={makeFieldDef(field_type)}
      fieldValue={fieldValue}
      entity={ENTITY}
      onDeleted={onDeleted}
      onSaved={onSaved}
      asset={asset}
      onAssetChanged={onAssetChanged}
    />
  );
  return { user, onDeleted, onSaved, onAssetChanged };
}

describe("PropertyRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("text field", () => {
    it("renders a text input", () => {
      setup("text");
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveAttribute("type", "text");
    });

    it("saves typed value on blur with Text payload", async () => {
      const { user } = setup("text");
      await user.type(screen.getByRole("textbox"), "Hello");
      await user.tab();
      await waitFor(() => {
        expect(mockSetFieldValue).toHaveBeenCalledWith({
          entity_id: "e1",
          field_def_id: "fd1",
          value: { type: "Text", value: "Hello" },
        });
      });
    });

    it("displays existing text value", () => {
      setup("text", makeFieldValue({ value_text: "existing" }));
      expect(screen.getByRole("textbox")).toHaveValue("existing");
    });
  });

  describe("number field", () => {
    it("renders a text input, not a number input", () => {
      setup("number");
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveAttribute("type", "text");
      expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    });

    it("saves typed value on blur with Number payload", async () => {
      const { user } = setup("number");
      await user.type(screen.getByRole("textbox"), "42");
      await user.tab();
      await waitFor(() => {
        expect(mockSetFieldValue).toHaveBeenCalledWith({
          entity_id: "e1",
          field_def_id: "fd1",
          value: { type: "Number", value: 42 },
        });
      });
    });

    it("saves decimal values correctly", async () => {
      const { user } = setup("number");
      await user.type(screen.getByRole("textbox"), "3.14");
      await user.tab();
      await waitFor(() => {
        expect(mockSetFieldValue).toHaveBeenCalledWith({
          entity_id: "e1",
          field_def_id: "fd1",
          value: { type: "Number", value: 3.14 },
        });
      });
    });

    it("displays existing number value as string", () => {
      setup("number", makeFieldValue({ value_number: 99 }));
      expect(screen.getByRole("textbox")).toHaveValue("99");
    });

    it("shows unit symbol when options contain a unit", () => {
      const fieldDefWithUnit = { ...makeFieldDef("number"), options: JSON.stringify({ unit: "kg" }) };
      render(
        <PropertyRow
          fieldDef={fieldDefWithUnit}
          fieldValue={undefined}
          entity={ENTITY}
          onDeleted={vi.fn()}
          onSaved={vi.fn()}
          asset={undefined}
          onAssetChanged={vi.fn()}
        />
      );
      expect(screen.getByText("kg")).toBeInTheDocument();
    });

    it("shows no unit label when options are null", () => {
      setup("number");
      expect(screen.queryByText("kg")).not.toBeInTheDocument();
    });
  });

  describe("date field", () => {
    it("renders a date input", () => {
      setup("date");
      const input = document.querySelector('input[type="date"]');
      expect(input).not.toBeNull();
    });

    it("saves date value on blur with Date payload", async () => {
      setup("date");
      const input = document.querySelector('input[type="date"]') as HTMLInputElement;
      fireEvent.change(input, { target: { value: "2024-01-15" } });
      fireEvent.blur(input);
      await waitFor(() => {
        expect(mockSetFieldValue).toHaveBeenCalledWith({
          entity_id: "e1",
          field_def_id: "fd1",
          value: { type: "Date", value: "2024-01-15" },
        });
      });
    });

    it("displays existing date value", () => {
      setup("date", makeFieldValue({ value_date: "2024-01-15" }));
      const input = document.querySelector('input[type="date"]') as HTMLInputElement;
      expect(input.value).toBe("2024-01-15");
    });
  });

  describe("textarea field", () => {
    it("renders a textarea, not an input", () => {
      setup("textarea");
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
    });

    it("saves typed value on blur with Text payload", async () => {
      const { user } = setup("textarea");
      await user.type(screen.getByRole("textbox"), "Long text");
      await user.tab();
      await waitFor(() => {
        expect(mockSetFieldValue).toHaveBeenCalledWith({
          entity_id: "e1",
          field_def_id: "fd1",
          value: { type: "Text", value: "Long text" },
        });
      });
    });
  });

  describe("image field", () => {
    it("shows Choose image button when no asset", () => {
      setup("image");
      expect(screen.getByRole("button", { name: /choose image/i })).toBeInTheDocument();
    });

    it("shows img element when asset is provided", async () => {
      setup("image", undefined, makeAsset());
      await waitFor(() => {
        expect(screen.getByRole("img")).toBeInTheDocument();
      });
    });

    it("uploads image when Choose image is clicked", async () => {
      const { user, onAssetChanged } = setup("image");
      mockDialogOpen.mockResolvedValue("/home/user/portrait.jpg");
      mockAddEntityAsset.mockResolvedValue(makeAsset());
      await user.click(screen.getByRole("button", { name: /choose image/i }));
      await waitFor(() => {
        expect(mockAddEntityAsset).toHaveBeenCalledWith("e1", "/home/user/portrait.jpg", "fd1");
        expect(onAssetChanged).toHaveBeenCalled();
      });
    });

    it("does nothing when file dialog is cancelled", async () => {
      const { user, onAssetChanged } = setup("image");
      mockDialogOpen.mockResolvedValue(null);
      await user.click(screen.getByRole("button", { name: /choose image/i }));
      await waitFor(() => {
        expect(mockAddEntityAsset).not.toHaveBeenCalled();
        expect(onAssetChanged).not.toHaveBeenCalled();
      });
    });

    it("adds the new asset before deleting the old one when replacing", async () => {
      const existing = makeAsset();
      const { user, onAssetChanged } = setup("image", undefined, existing);
      mockDialogOpen.mockResolvedValue("/home/user/new.jpg");
      mockDeleteEntityAsset.mockResolvedValue(undefined);
      mockAddEntityAsset.mockResolvedValue(makeAsset({ id: "asset2" }));
      await waitFor(() => screen.getByRole("img"));
      const replaceBtn = screen.getByTitle("Replace image");
      await user.click(replaceBtn);
      await waitFor(() => {
        expect(mockDeleteEntityAsset).toHaveBeenCalledWith("asset1");
        expect(mockAddEntityAsset).toHaveBeenCalledWith("e1", "/home/user/new.jpg", "fd1");
        expect(onAssetChanged).toHaveBeenCalled();
      });
      const addOrder = mockAddEntityAsset.mock.invocationCallOrder[0];
      const deleteOrder = mockDeleteEntityAsset.mock.invocationCallOrder[0];
      expect(addOrder).toBeLessThan(deleteOrder);
    });

    it("keeps the old asset when the new upload fails", async () => {
      const existing = makeAsset();
      const { user, onAssetChanged } = setup("image", undefined, existing);
      mockDialogOpen.mockResolvedValue("/home/user/new.jpg");
      mockAddEntityAsset.mockRejectedValue(new Error("Image could not be reduced to under 20KB"));
      await waitFor(() => screen.getByRole("img"));
      const replaceBtn = screen.getByTitle("Replace image");
      await user.click(replaceBtn);
      await waitFor(() => {
        expect(mockAddEntityAsset).toHaveBeenCalled();
      });
      expect(mockDeleteEntityAsset).not.toHaveBeenCalled();
      expect(onAssetChanged).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByText(/could not be reduced/i)).toBeInTheDocument();
      });
    });

    it("removes asset when remove button is clicked", async () => {
      const { user, onAssetChanged } = setup("image", undefined, makeAsset());
      mockDeleteEntityAsset.mockResolvedValue(undefined);
      await waitFor(() => screen.getByRole("img"));
      const removeBtn = screen.getByTitle("Remove image");
      await user.click(removeBtn);
      await waitFor(() => {
        expect(mockDeleteEntityAsset).toHaveBeenCalledWith("asset1");
        expect(onAssetChanged).toHaveBeenCalled();
      });
    });
  });

  describe("delete", () => {
    it("calls invokeDeleteFieldDefinition and onDeleted on click", async () => {
      mockDeleteFieldDefinition.mockResolvedValue(undefined);
      const { user, onDeleted } = setup("text");
      await user.click(screen.getByTitle("Remove property"));
      await waitFor(() => {
        expect(mockDeleteFieldDefinition).toHaveBeenCalledWith("fd1");
        expect(onDeleted).toHaveBeenCalledWith("fd1");
      });
    });
  });
});
