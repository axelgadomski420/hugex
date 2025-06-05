import { useEffect, useRef, useCallback, useState } from "react";

interface AutoSaveOptions {
  delay?: number; // Delay in milliseconds before auto-save triggers
  onSave: () => Promise<void> | void; // Function to call when auto-saving
  onSuccess?: () => void; // Optional success callback
  onError?: (error: Error) => void; // Optional error callback
  enabled?: boolean; // Whether auto-save is enabled
}

interface AutoSaveState {
  isAutoSaving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
}

interface AutoSaveReturn extends AutoSaveState {
  triggerSave: () => void;
  markAsChanged: () => void;
  markAsSaved: () => void;
}

export const useAutoSave = (
  dependencies: any[],
  options: AutoSaveOptions
): AutoSaveReturn => {
  const {
    delay = 500, // Much faster default - 500ms
    onSave,
    onSuccess,
    onError,
    enabled = true,
  } = options;

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAutoSavingRef = useRef(false);
  const lastSavedRef = useRef<Date | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const initialRenderRef = useRef(true);

  // Force re-render when state changes
  const [, forceUpdate] = useState({});
  const rerender = useCallback(() => forceUpdate({}), []);

  const markAsChanged = useCallback(() => {
    hasUnsavedChangesRef.current = true;
    rerender();
  }, [rerender]);

  const markAsSaved = useCallback(() => {
    hasUnsavedChangesRef.current = false;
    lastSavedRef.current = new Date();
    rerender();
  }, [rerender]);

  const triggerSave = useCallback(async () => {
    if (isAutoSavingRef.current || !hasUnsavedChangesRef.current) {
      return;
    }

    isAutoSavingRef.current = true;
    rerender();

    try {
      await onSave();
      markAsSaved();
      onSuccess?.();
    } catch (error) {
      console.error("Auto-save failed:", error);
      onError?.(error instanceof Error ? error : new Error("Auto-save failed"));
    } finally {
      isAutoSavingRef.current = false;
      rerender();
    }
  }, [onSave, onSuccess, onError, markAsSaved, rerender]);

  // Auto-save effect
  useEffect(() => {
    // Skip auto-save on initial render
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      return;
    }

    if (!enabled) {
      return;
    }

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Mark as changed
    markAsChanged();

    // Set new timeout for auto-save
    timeoutRef.current = setTimeout(() => {
      triggerSave();
    }, delay);

    // Cleanup timeout on dependency change or unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, dependencies);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isAutoSaving: isAutoSavingRef.current,
    lastSaved: lastSavedRef.current,
    hasUnsavedChanges: hasUnsavedChangesRef.current,
    triggerSave,
    markAsChanged,
    markAsSaved,
  };
};
