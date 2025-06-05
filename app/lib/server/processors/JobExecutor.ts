import type { JobDiff } from "~/types/job";

// Base interface for job execution strategies
export abstract class JobExecutor {
  abstract execute(jobId: string, jobData: any, credentials: any): Promise<any>;

  protected parseDiff(diffOutput: string, jobId: string): JobDiff {
    const files: any[] = [];
    const lines = diffOutput.split("\n");
    let currentFile: any = null;
    let currentPatch: string[] = [];
    let inFileHeader = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Start of a new file diff
      if (line.startsWith("diff --git ")) {
        // Save previous file if it exists
        if (currentFile) {
          const patchContent = currentPatch.join("\n");
          currentFile.patch = patchContent;
          currentFile.diff = patchContent; // Add diff field as alias to patch
          files.push(currentFile);
        }

        // Extract filename from "diff --git a/filename b/filename"
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        if (match) {
          const filename = match[2]; // Use the 'b/' version (destination)
          currentFile = {
            filename: filename,
            status: "modified", // Default, will be updated if we see new/deleted file
            additions: 0,
            deletions: 0,
            patch: "",
            diff: "", // Add diff field
          };
          currentPatch = [line];
          inFileHeader = true;
        }
      }
      // File mode/index information
      else if (
        line.startsWith("index ") ||
        line.startsWith("new file mode") ||
        line.startsWith("deleted file mode")
      ) {
        if (currentPatch) currentPatch.push(line);

        // Detect new files
        if (line.startsWith("new file mode")) {
          if (currentFile) currentFile.status = "added";
        }
        // Detect deleted files
        else if (line.startsWith("deleted file mode")) {
          if (currentFile) currentFile.status = "deleted";
        }
      }
      // File headers (--- and +++)
      else if (line.startsWith("--- ") || line.startsWith("+++ ")) {
        if (currentPatch) currentPatch.push(line);
      }
      // Hunk headers (@@ lines)
      else if (line.startsWith("@@")) {
        if (currentPatch) currentPatch.push(line);
        inFileHeader = false;
      }
      // Content lines
      else if (line.startsWith("+") && !inFileHeader) {
        if (currentFile) currentFile.additions++;
        if (currentPatch) currentPatch.push(line);
      } else if (line.startsWith("-") && !inFileHeader) {
        if (currentFile) currentFile.deletions++;
        if (currentPatch) currentPatch.push(line);
      }
      // Context lines (unchanged lines in diff)
      else if (line.startsWith(" ") || line === "") {
        if (currentPatch && !inFileHeader) currentPatch.push(line);
      }
      // Handle "\ No newline at end of file"
      else if (line.startsWith("\\ No newline at end of file")) {
        if (currentPatch) currentPatch.push(line);
      }
    }

    // Don't forget the last file
    if (currentFile) {
      const patchContent = currentPatch.join("\n");
      currentFile.patch = patchContent;
      currentFile.diff = patchContent; // Add diff field as alias to patch
      files.push(currentFile);
    }

    // Calculate summary
    const summary = {
      totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
      totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
      totalFiles: files.length,
    };

    return {
      jobId,
      files,
      summary,
    };
  }
}
