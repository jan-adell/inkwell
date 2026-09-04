import { create } from "zustand";
import type { Document, Entity, EntityType, KnownProject } from "../types/core";

type ActiveView = "writing" | "worldbuilding";

interface AppState {
  // ── Initialisation ────────────────────────────────────────────────────────
  coreInitialized: boolean;
  initStatus: string;
  initError: string | null;
  projectId: string | null;
  projectPath: string | null;

  // ── Navigation ─────────────────────────────────────────────────────────
  activeView: ActiveView;
  selectedDocumentId: string | null;
  selectedEntityId: string | null;

  // ── Modals ─────────────────────────────────────────────────────────
  showCreateEntityModal: boolean;
  showCreateDocumentModal: boolean;

  // ── Document tree ────────────────────────────────────────────────────────
  rootDocuments: Document[];
  childrenMap: Record<string, Document[]>; // parent_id → children

  // ── Project library ───────────────────────────────────────────────────────
  knownProjects: KnownProject[];

  // ── Worldbuilding ────────────────────────────────────────────────────────
  entityTypes: EntityType[];
  entitiesByType: Record<string, Entity[]>; // entity_type_id → entities

  // ── Actions ──────────────────────────────────────────────────────────
  setCoreInitialized: (value: boolean) => void;
  setInitStatus: (status: string) => void;
  setInitError: (error: string | null) => void;
  setProjectId: (id: string | null) => void;
  setProjectPath: (path: string | null) => void;
  setActiveView: (view: ActiveView) => void;
  setSelectedDocumentId: (id: string | null) => void;
  setSelectedEntityId: (id: string | null) => void;
  setRootDocuments: (docs: Document[]) => void;
  setChildren: (parentId: string, docs: Document[]) => void;
  addDocument: (doc: Document) => void;
  updateDocument: (doc: Document) => void;
  removeDocument: (id: string) => void;
  setKnownProjects: (projects: KnownProject[]) => void;
  resetProjectState: () => void;
  setEntityTypes: (types: EntityType[]) => void;
  setEntitiesForType: (typeId: string, entities: Entity[]) => void;
  setShowCreateEntityModal: (value: boolean) => void;
  setShowCreateDocumentModal: (value: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  coreInitialized: false,
  initStatus: "Starting…",
  initError: null,
  projectId: null,
  projectPath: null,
  activeView: "writing",
  selectedDocumentId: null,
  selectedEntityId: null,
  showCreateEntityModal: false,
  showCreateDocumentModal: false,
  rootDocuments: [],
  childrenMap: {},
  knownProjects: [],
  entityTypes: [],
  entitiesByType: {},

  setCoreInitialized: (value) => set({ coreInitialized: value }),
  setInitStatus: (status) => set({ initStatus: status }),
  setInitError: (error) => set({ initError: error }),
  setProjectId: (id) => set({ projectId: id }),
  setProjectPath: (path) => set({ projectPath: path }),
  setActiveView: (view) => set({ activeView: view }),
  setSelectedDocumentId: (id) => set({ selectedDocumentId: id }),
  setSelectedEntityId: (id) => set({ selectedEntityId: id }),
  setRootDocuments: (docs) => set({ rootDocuments: docs }),
  setChildren: (parentId, docs) =>
    set((s) => ({ childrenMap: { ...s.childrenMap, [parentId]: docs } })),
  addDocument: (doc) =>
    set((s) =>
      doc.parent_id
        ? {
            childrenMap: {
              ...s.childrenMap,
              [doc.parent_id]: [...(s.childrenMap[doc.parent_id] ?? []), doc],
            },
          }
        : { rootDocuments: [...s.rootDocuments, doc] }
    ),
  updateDocument: (doc) =>
    set((s) => ({
      rootDocuments: s.rootDocuments.map((d) => (d.id === doc.id ? doc : d)),
      childrenMap: Object.fromEntries(
        Object.entries(s.childrenMap).map(([pid, docs]) => [
          pid,
          docs.map((d) => (d.id === doc.id ? doc : d)),
        ]),
      ),
    })),
  removeDocument: (id) =>
    set((s) => ({
      rootDocuments: s.rootDocuments.filter((d) => d.id !== id),
      selectedDocumentId: s.selectedDocumentId === id ? null : s.selectedDocumentId,
    })),
  setKnownProjects: (projects) => set({ knownProjects: projects }),
  resetProjectState: () =>
    set({
      rootDocuments: [],
      childrenMap: {},
      entityTypes: [],
      entitiesByType: {},
      selectedDocumentId: null,
      selectedEntityId: null,
      projectPath: null,
    }),
  setEntityTypes: (types) => set({ entityTypes: types }),
  setEntitiesForType: (typeId, entities) =>
    set((s) => ({ entitiesByType: { ...s.entitiesByType, [typeId]: entities } })),
  setShowCreateEntityModal: (value) => set({ showCreateEntityModal: value }),
  setShowCreateDocumentModal: (value) => set({ showCreateDocumentModal: value }),
}));
