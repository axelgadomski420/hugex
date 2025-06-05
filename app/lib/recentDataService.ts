// Service for managing recent repositories and branches data
import {
  setToLocalStorage,
  getFromLocalStorage,
  STORAGE_KEYS as GLOBAL_STORAGE_KEYS,
} from "./autoSaveService";

export interface RecentRepository {
  url: string;
  name: string;
  lastUsed: Date;
}

export interface RecentBranch {
  name: string;
  lastUsed: Date;
}

export class RecentDataService {
  // Repository methods
  static getRecentRepositories(): RecentRepository[] {
    const stored = getFromLocalStorage(GLOBAL_STORAGE_KEYS.recentRepos, []);
    return stored.map((repo: any) => ({
      ...repo,
      lastUsed: new Date(repo.lastUsed),
    }));
  }

  static addRecentRepository(url: string): void {
    const recentRepos = this.getRecentRepositories();
    const name = this.extractRepositoryName(url);

    // Remove existing entry if it exists
    const filtered = recentRepos.filter((repo) => repo.url !== url);

    // Add to beginning
    const updated = [{ url, name, lastUsed: new Date() }, ...filtered].slice(
      0,
      10
    ); // Keep only last 10

    setToLocalStorage(GLOBAL_STORAGE_KEYS.recentRepos, updated, true);
  }

  static extractRepositoryName(url: string): string {
    try {
      // Handle both full GitHub URLs and shorthand names
      if (url.includes("github.com")) {
        const match = url.match(/github\.com\/([\w\-\.]+\/[\w\-\.]+)/);
        return match ? match[1] : url;
      }
      return url;
    } catch {
      return url;
    }
  }

  // Branch methods
  static getRecentBranches(): RecentBranch[] {
    const stored = getFromLocalStorage(GLOBAL_STORAGE_KEYS.recentBranches, []);
    return stored.map((branch: any) => ({
      ...branch,
      lastUsed: new Date(branch.lastUsed),
    }));
  }

  static addRecentBranch(name: string): void {
    const recentBranches = this.getRecentBranches();

    // Remove existing entry if it exists
    const filtered = recentBranches.filter((branch) => branch.name !== name);

    // Add to beginning
    const updated = [{ name, lastUsed: new Date() }, ...filtered].slice(0, 10); // Keep only last 10

    setToLocalStorage(GLOBAL_STORAGE_KEYS.recentBranches, updated, true);
  }

  // Selected values persistence
  static getSelectedRepository(): string {
    return getFromLocalStorage(GLOBAL_STORAGE_KEYS.selectedRepo, "");
  }

  static setSelectedRepository(url: string): void {
    setToLocalStorage(GLOBAL_STORAGE_KEYS.selectedRepo, url, true);
    if (url) {
      this.addRecentRepository(url);
    }
  }

  static getSelectedBranch(): string {
    return getFromLocalStorage(GLOBAL_STORAGE_KEYS.selectedBranch, "");
  }

  static setSelectedBranch(name: string): void {
    setToLocalStorage(GLOBAL_STORAGE_KEYS.selectedBranch, name, true);
    if (name) {
      this.addRecentBranch(name);
    }
  }

  // Common branches list
  static getCommonBranches(): string[] {
    return ["main", "master", "develop", "dev", "staging", "feature/new-ui"];
  }
}
