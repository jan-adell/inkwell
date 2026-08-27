import { useReducer } from "react";
import { useAppStore } from "./store/appStore";
import { SplashPage } from "./pages/SplashPage";
import { ProjectLibrary } from "./pages/ProjectLibrary";
import { CreateProject } from "./pages/CreateProject";
import { ProjectShell } from "./pages/ProjectShell";

type Screen = "library" | "create" | "shell";

/**
 * App — top-level router.
 *
 * Flow:
 *   SplashPage  (while coreInitialized === false)
 *     ↓  init completes
 *   ProjectLibrary  (pick or create a project)
 *     ↓  user selects or creates
 *   ProjectShell   (writing + worldbuilding workspace)
 *
 * Navigation is local state — no routing library needed at this stage.
 */
export default function App() {
  const { coreInitialized, setProjectId } = useAppStore();
  const [screen, setScreen] = useReducer(
    (_prev: Screen, next: Screen) => next,
    "library" as Screen
  );

  // While the core is not ready, always show the splash screen.
  if (!coreInitialized) {
    return <SplashPage />;
  }

  if (screen === "library") {
    return (
      <ProjectLibrary
        onOpenProject={(project) => {
          setProjectId(project.id);
          setScreen("shell");
        }}
        onNewProject={() => setScreen("create")}
      />
    );
  }

  if (screen === "create") {
    return (
      <CreateProject
        onCancel={() => setScreen("library")}
        onCreated={(name) => {
          // Integration point: replace with invokeCreateProject(name) from
          // hooks/useTauri.ts when the Tauri command is wired up.
          const mockId = `project-${Date.now()}`;
          setProjectId(mockId);
          console.info(`[Inkwell] Created project "${name}" — id: ${mockId}`);
          setScreen("shell");
        }}
      />
    );
  }

  // screen === "shell"
  return <ProjectShell />;
}
