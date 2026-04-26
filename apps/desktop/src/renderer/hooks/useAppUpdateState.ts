import { useEffect, useState } from "react";
import type { AppUpdateState } from "../../shared/types";

export function useAppUpdateState(): AppUpdateState | null {
  const [state, setState] = useState<AppUpdateState | null>(null);

  useEffect(() => {
    let cancelled = false;

    void window.api.app.getUpdateState().then((nextState) => {
      if (!cancelled) {
        setState(nextState);
      }
    });

    const unsubscribe = window.api.app.onUpdateStateChanged((nextState) => {
      setState(nextState);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
