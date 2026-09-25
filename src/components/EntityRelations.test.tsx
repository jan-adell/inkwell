import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EntityRelationsSection } from "./EntityRelations";
import { useAppStore } from "../store/appStore";
import type { Entity, EntityType, Relation, RelationType } from "../types/core";

vi.mock("../hooks/useTauri", () => ({
  invokeListRelationTypes: vi.fn(),
  invokeCreateRelationType: vi.fn(),
  invokeCreateRelation: vi.fn(),
  invokeDeleteRelation: vi.fn(),
  invokeListOutgoingRelations: vi.fn(),
  invokeListIncomingRelations: vi.fn(),
}));

import {
  invokeListRelationTypes,
  invokeCreateRelationType,
  invokeCreateRelation,
  invokeDeleteRelation,
  invokeListOutgoingRelations,
  invokeListIncomingRelations,
} from "../hooks/useTauri";

const mockListRelationTypes = invokeListRelationTypes as ReturnType<typeof vi.fn>;
const mockCreateRelationType = invokeCreateRelationType as ReturnType<typeof vi.fn>;
const mockCreateRelation = invokeCreateRelation as ReturnType<typeof vi.fn>;
const mockDeleteRelation = invokeDeleteRelation as ReturnType<typeof vi.fn>;
const mockListOutgoing = invokeListOutgoingRelations as ReturnType<typeof vi.fn>;
const mockListIncoming = invokeListIncomingRelations as ReturnType<typeof vi.fn>;

const FATHER: Entity = {
  id: "father-id-000000000000000",
  project_id: "p1",
  entity_type_id: "et1",
  name: "Aragorn",
  summary: null,
  cover_image: null,
  visibility: "private",
  sort_order: 0,
  folder_id: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  deleted_at: null,
};

const SON: Entity = {
  ...FATHER,
  id: "son-id-0000000000000000000",
  name: "Eldarion",
};

const ENTITY_TYPE: EntityType = {
  id: "et1",
  project_id: "p1",
  name: "Character",
  name_plural: "Characters",
  icon: null,
  color: "#c9a84c",
  description: null,
  is_system: false,
  sort_order: 0,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  deleted_at: null,
};

function makeRelationType(overrides: Partial<RelationType> = {}): RelationType {
  return {
    id: "rt1",
    project_id: "p1",
    name: "father_son",
    label: "Son",
    inverse_name: "son_father",
    inverse_label: "Father",
    allowed_source_types: null,
    allowed_target_types: null,
    color: null,
    is_system: false,
    created_at: "2026-01-01",
    deleted_at: null,
    ...overrides,
  };
}

function makeRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: "rel1",
    project_id: "p1",
    source_entity_id: FATHER.id,
    relation_type_id: "rt1",
    target_entity_id: SON.id,
    notes: null,
    sort_order: 0,
    created_at: "2026-01-01",
    deleted_at: null,
    ...overrides,
  };
}

function resetStore() {
  useAppStore.setState({
    projectId: "p1",
    entityTypes: [ENTITY_TYPE],
    relationTypes: [],
    rootEntities: [FATHER, SON],
    entitiesByFolder: {},
    selectedEntityId: null,
  });
}

describe("EntityRelationsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    mockListRelationTypes.mockResolvedValue([]);
    mockListOutgoing.mockResolvedValue([]);
    mockListIncoming.mockResolvedValue([]);
  });

  it("shows an empty state with no relations", async () => {
    render(<EntityRelationsSection entity={FATHER} />);
    await waitFor(() => {
      expect(mockListOutgoing).toHaveBeenCalledWith(FATHER.id);
    });
    expect(screen.getByRole("button", { name: /add relation/i })).toBeInTheDocument();
  });

  it("renders an outgoing relation using the forward label", async () => {
    const relType = makeRelationType();
    mockListRelationTypes.mockResolvedValue([relType]);
    mockListOutgoing.mockResolvedValue([makeRelation()]);

    render(<EntityRelationsSection entity={FATHER} />);

    await waitFor(() => {
      expect(screen.getByText("Son")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Eldarion" })).toBeInTheDocument();
    });
  });

  it("renders an incoming relation using the inverse label", async () => {
    const relType = makeRelationType();
    mockListRelationTypes.mockResolvedValue([relType]);
    mockListIncoming.mockResolvedValue([makeRelation()]);

    render(<EntityRelationsSection entity={SON} />);

    await waitFor(() => {
      expect(screen.getByText("Father")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Aragorn" })).toBeInTheDocument();
    });
  });

  it("navigates when clicking the related entity", async () => {
    mockListRelationTypes.mockResolvedValue([makeRelationType()]);
    mockListOutgoing.mockResolvedValue([makeRelation()]);
    const user = userEvent.setup();

    render(<EntityRelationsSection entity={FATHER} />);
    await waitFor(() => screen.getByRole("button", { name: "Eldarion" }));
    await user.click(screen.getByRole("button", { name: "Eldarion" }));

    expect(useAppStore.getState().selectedEntityId).toBe(SON.id);
  });

  it("deletes a relation when the remove button is clicked", async () => {
    mockListRelationTypes.mockResolvedValue([makeRelationType()]);
    mockListOutgoing.mockResolvedValue([makeRelation()]);
    mockDeleteRelation.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<EntityRelationsSection entity={FATHER} />);
    await waitFor(() => screen.getByTitle("Remove relation"));
    await user.click(screen.getByTitle("Remove relation"));

    await waitFor(() => {
      expect(mockDeleteRelation).toHaveBeenCalledWith("rel1");
    });
  });

  it("creates a relation with a brand-new role pair, current entity as the typed-first role", async () => {
    mockCreateRelationType.mockResolvedValue(makeRelationType({ id: "rt-new", label: "Father", inverse_label: "Son" }));
    mockCreateRelation.mockResolvedValue(makeRelation({ id: "rel-new", relation_type_id: "rt-new" }));
    const user = userEvent.setup();

    render(<EntityRelationsSection entity={FATHER} />);
    await user.click(screen.getByRole("button", { name: /add relation/i }));

    await user.type(screen.getByPlaceholderText(/search for the other entity/i), "Eldarion");
    await user.click(await screen.findByRole("button", { name: "Eldarion" }));

    await user.selectOptions(screen.getByRole("combobox"), "__new__");
    await user.type(screen.getByPlaceholderText(/this entity.*role/i), "Father");
    await user.type(screen.getByPlaceholderText(/Eldarion.*role/i), "Son");

    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(mockCreateRelationType).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ label: "Father", inverse_label: "Son" })
      );
      expect(mockCreateRelation).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({
          source_entity_id: FATHER.id,
          target_entity_id: SON.id,
          relation_type_id: "rt-new",
        })
      );
    });
  });

  it("shows a natural-language role choice when reusing an asymmetric pair, and swaps source/target accordingly", async () => {
    mockListRelationTypes.mockResolvedValue([makeRelationType({ id: "rt1", label: "Son", inverse_label: "Father" })]);
    mockCreateRelation.mockResolvedValue(makeRelation({ id: "rel-new" }));
    const user = userEvent.setup();

    render(<EntityRelationsSection entity={FATHER} />);
    await user.click(screen.getByRole("button", { name: /add relation/i }));
    await user.type(screen.getByPlaceholderText(/search for the other entity/i), "Eldarion");
    await user.click(await screen.findByRole("button", { name: "Eldarion" }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Son ↔ Father/i })).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByRole("combobox"), "rt1");

    // Never phrased as source/target/forward/reverse/direction.
    expect(screen.queryByText(/source/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/target/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/direction/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aragorn is the Father" }));
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(mockCreateRelation).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({
          source_entity_id: SON.id,
          target_entity_id: FATHER.id,
          relation_type_id: "rt1",
        })
      );
    });
  });

  it("surfaces a duplicate-relation error from the backend", async () => {
    mockListRelationTypes.mockResolvedValue([makeRelationType({ id: "rt1", label: "Son", inverse_label: "Father" })]);
    mockCreateRelation.mockRejectedValue(new Error("Relation already exists"));
    const user = userEvent.setup();

    render(<EntityRelationsSection entity={FATHER} />);
    await user.click(screen.getByRole("button", { name: /add relation/i }));
    await user.type(screen.getByPlaceholderText(/search for the other entity/i), "Eldarion");
    await user.click(await screen.findByRole("button", { name: "Eldarion" }));
    await waitFor(() => screen.getByRole("combobox"));
    await user.selectOptions(screen.getByRole("combobox"), "rt1");
    await user.click(screen.getByRole("button", { name: "Aragorn is the Son" }));
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/relation already exists/i)).toBeInTheDocument();
    });
  });

  it("requires an explicit role choice for an asymmetric pair before submitting", async () => {
    mockListRelationTypes.mockResolvedValue([makeRelationType({ id: "rt1", label: "Son", inverse_label: "Father" })]);
    const user = userEvent.setup();

    render(<EntityRelationsSection entity={FATHER} />);
    await user.click(screen.getByRole("button", { name: /add relation/i }));
    await user.type(screen.getByPlaceholderText(/search for the other entity/i), "Eldarion");
    await user.click(await screen.findByRole("button", { name: "Eldarion" }));
    await waitFor(() => screen.getByRole("combobox"));
    await user.selectOptions(screen.getByRole("combobox"), "rt1");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByText(/choose which role/i)).toBeInTheDocument();
    });
    expect(mockCreateRelation).not.toHaveBeenCalled();
  });
});
