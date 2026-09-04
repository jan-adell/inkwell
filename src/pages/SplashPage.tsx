import { useEffect } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { invokeInitializeCore, invokeListKnownProjects } from "../hooks/useTauri";

export function SplashPage() {
  const {
    initStatus, initError,
    setCoreInitialized, setInitStatus, setInitError, setKnownProjects,
  } = useAppStore();

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setInitStatus("Initializing…");
      try {
        const result = await invokeInitializeCore();
        if (cancelled) return;
        if (result.ok) {
          const projects = await invokeListKnownProjects();
          if (cancelled) return;
          setKnownProjects(projects);
          setCoreInitialized(true);
        } else {
          setInitError(result.message);
        }
      } catch (err) {
        if (cancelled) return;
        setInitError(
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : JSON.stringify(err) ?? "Initialization failed",
        );
      }
    }
    init();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col items-center justify-center bg-ink-gradient select-none">
      <div className="mb-12 text-center">
        <h1 className="text-6xl tracking-[0.2em] uppercase font-display text-gold">
          INKWELL
        </h1>
        <p className="mt-3 text-ivory-dim text-sm tracking-[0.3em] uppercase font-body">
          Write · Build · Imagine
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 min-h-[4rem]">
        {initError ? (
          <div className="flex items-center gap-2 text-crimson">
            <AlertCircle size={16} />
            <span className="text-sm font-mono">{initError}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-ivory-ghost">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm font-mono">{initStatus}</span>
          </div>
        )}
      </div>

      <div className="absolute bottom-6 text-ivory-ghost text-xs tracking-widest font-mono">
        LOCAL · PRIVATE · YOURS
      </div>
    </div>
  );
}

