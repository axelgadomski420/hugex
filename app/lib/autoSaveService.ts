// Auto-save utilities for localStorage and configuration
export class AutoSaveService {
  private static saveQueue = new Map<string, NodeJS.Timeout>();
  private static readonly DEFAULT_DELAY = 300; // Much faster - 300ms for localStorage

  /**
   * Auto-save to localStorage with debouncing
   */
  static saveToLocalStorage(
    key: string,
    value: any,
    delay = this.DEFAULT_DELAY
  ) {
    // Clear existing timeout for this key
    const existingTimeout = this.saveQueue.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      try {
        const serializedValue =
          typeof value === "string" ? value : JSON.stringify(value);
        localStorage.setItem(key, serializedValue);
        console.log(`Auto-saved to localStorage: ${key}`);
        this.saveQueue.delete(key);
      } catch (error) {
        console.error(`Failed to auto-save to localStorage (${key}):`, error);
      }
    }, delay);

    this.saveQueue.set(key, timeout);
  }

  /**
   * Show a very subtle save indicator
   */
  static showSaveIndicator(
    message: string = "Saving...",
    type: "saving" | "saved" | "error" = "saving"
  ) {
    // Only show error messages, skip success indicators for subtlety
    if (type !== "error") {
      return;
    }

    // Remove existing indicator
    const existing = document.querySelector("[data-autosave-indicator]");
    if (existing) {
      existing.remove();
    }

    const indicator = document.createElement("div");
    indicator.setAttribute("data-autosave-indicator", "true");

    // Much more subtle styling
    indicator.className = `fixed bottom-4 right-4 bg-red-500 text-white px-3 py-1.5 rounded text-xs shadow-lg z-50 transition-all duration-200`;
    indicator.innerHTML = `
      <div class="flex items-center gap-1">
        <div class="w-1 h-1 bg-white rounded-full"></div>
        <span>${message}</span>
      </div>
    `;

    document.body.appendChild(indicator);

    // Auto-remove quickly
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.style.opacity = "0";
        indicator.style.transform = "translateY(10px)";
        setTimeout(() => {
          if (indicator.parentNode) {
            indicator.remove();
          }
        }, 200);
      }
    }, 3000);
  }

  /**
   * Clear all pending saves (useful for cleanup)
   */
  static clearAllPending() {
    this.saveQueue.forEach((timeout) => clearTimeout(timeout));
    this.saveQueue.clear();
  }

  /**
   * Force save all pending items immediately
   */
  static async forceSaveAll() {
    const promises: Promise<void>[] = [];

    this.saveQueue.forEach((timeout, key) => {
      clearTimeout(timeout);
      // Force immediate save by calling the timeout function
      promises.push(Promise.resolve());
    });

    this.saveQueue.clear();
    await Promise.all(promises);
  }
}

// Storage keys used throughout the application
export const STORAGE_KEYS = {
  dockerConfig: "hugex_docker_config",
  localSecrets: "hugex_local_secrets",
  templateText: "hugex_template_text",
  selectedRepo: "hugex_selected_repo",
  selectedBranch: "hugex_selected_branch",
  recentRepos: "hugex_recent_repositories",
  recentBranches: "hugex_recent_branches",
  welcomeSeen: "hugex_welcome_seen",
} as const;

// Helper function to safely parse JSON from localStorage
export function getFromLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window === "undefined") return defaultValue;
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item);
  } catch {
    return defaultValue;
  }
}

// Helper function to safely set JSON to localStorage with auto-save
export function setToLocalStorage(key: string, value: any, autoSave = true) {
  try {
    if (typeof window === "undefined") return;

    if (autoSave) {
      AutoSaveService.saveToLocalStorage(key, value);
    } else {
      const serializedValue =
        typeof value === "string" ? value : JSON.stringify(value);
      localStorage.setItem(key, serializedValue);
    }
  } catch (error) {
    console.error(`Failed to save to localStorage (${key}):`, error);
  }
}
