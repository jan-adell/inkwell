import { useReducer } from "react";
import { useAppStore } from "./store/appStore";
import { invokeOpenProject, invokeListKnownProjects } from "./hooks/useTauri";
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
  const { coreInitialized, setProjectId, setKnownProjects, resetProjectState } = useAppStore();
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
        onOpenProject={async (project) => {
          await invokeOpenProject(project.path);
          resetProjectState();
          setProjectId(project.project_id);
          const updated = await invokeListKnownProjects();
          setKnownProjects(updated);
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
        onCreated={async (projectId) => {
          resetProjectState();
          setProjectId(projectId);
          const updated = await invokeListKnownProjects();
          setKnownProjects(updated);
          setScreen("shell");
        }}
      />
    );
  }

  // screen === "shell"
  return <ProjectShell onGoToLibrary={() => setScreen("library")} />;
}
