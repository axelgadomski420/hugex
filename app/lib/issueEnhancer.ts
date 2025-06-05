import {
  GitHubService,
  parseIssueMentions,
  type GitHubIssue,
} from "./githubService";

export interface EnhancedJob {
  title: string;
  description: string;
  referencedIssues: GitHubIssue[];
}

export class IssueEnhancer {
  /**
   * Enhances a job description by replacing issue mentions with full issue details
   * @param originalDescription The original task description with issue mentions (e.g., "Fix the bug in #123")
   * @param selectedRepo The selected repository URL
   * @param originalTitle The original job title
   * @returns Enhanced job with full issue details included
   */
  static async enhanceJobWithIssueDetails(
    originalDescription: string,
    selectedRepo: string,
    originalTitle?: string
  ): Promise<EnhancedJob> {
    // Parse issue mentions from the description
    const mentions = parseIssueMentions(originalDescription);

    if (mentions.length === 0) {
      // No issues mentioned, return as-is
      return {
        title: originalTitle || originalDescription.substring(0, 50),
        description: originalDescription,
        referencedIssues: [],
      };
    }

    // Fetch all mentioned issues
    const repoUrl = selectedRepo.includes("github.com")
      ? selectedRepo
      : `https://github.com/${selectedRepo}`;

    const issuePromises = mentions.map((mention) =>
      GitHubService.getIssue(repoUrl, mention.number)
    );

    const issues = await Promise.all(issuePromises);
    const validIssues = issues.filter(
      (issue): issue is GitHubIssue => issue !== null
    );

    // Create enhanced description
    let enhancedDescription = originalDescription;
    let enhancedTitle = originalTitle;

    // If we have valid issues, enhance the description
    if (validIssues.length > 0) {
      // Build the enhanced description with issue details
      enhancedDescription = this.buildEnhancedDescription(
        originalDescription,
        validIssues,
        mentions
      );

      // If no custom title provided, generate one based on issues
      if (!enhancedTitle) {
        enhancedTitle = this.generateTitleFromIssues(
          originalDescription,
          validIssues
        );
      }
    }

    return {
      title: enhancedTitle || originalDescription.substring(0, 50),
      description: enhancedDescription,
      referencedIssues: validIssues,
    };
  }

  /**
   * Builds an enhanced description by replacing issue mentions with detailed information
   */
  private static buildEnhancedDescription(
    originalDescription: string,
    issues: GitHubIssue[],
    mentions: Array<{ number: number; startIndex: number; endIndex: number }>
  ): string {
    // Create a map of issue numbers to issue objects for quick lookup
    const issueMap = new Map<number, GitHubIssue>();
    issues.forEach((issue) => issueMap.set(issue.number, issue));

    // Build enhanced description by replacing mentions with full details
    let result = originalDescription;
    let offset = 0; // Track offset due to text replacement

    // Process mentions in reverse order to avoid index shifting issues
    const sortedMentions = [...mentions].sort(
      (a, b) => b.startIndex - a.startIndex
    );

    for (const mention of sortedMentions) {
      const issue = issueMap.get(mention.number);
      if (!issue) continue;

      const originalText = `#${mention.number}`;
      const enhancedText = this.formatIssueForDescription(issue);

      // Replace the issue mention with enhanced text
      const start = mention.startIndex;
      const end = mention.endIndex;

      result =
        result.substring(0, start) + enhancedText + result.substring(end);
    }

    // Add a summary section if multiple issues are referenced
    if (issues.length > 1) {
      result += this.buildIssuesSummary(issues);
    }

    return result;
  }

  /**
   * Formats a single issue for inclusion in the description
   */
  private static formatIssueForDescription(issue: GitHubIssue): string {
    const statusEmoji = issue.state === "open" ? "🔓" : "✅";
    const labels =
      issue.labels.length > 0
        ? ` [${issue.labels.map((l) => l.name).join(", ")}]`
        : "";

    let issueText = `${statusEmoji} Issue #${issue.number}: "${issue.title}"${labels}`;

    // Add issue body if it exists and is not too long
    if (issue.body && issue.body.trim()) {
      const body = issue.body.trim();
      // Clean up markdown and limit length
      const cleanBody = body
        .replace(/```[\s\S]*?```/g, "[code block]") // Replace code blocks
        .replace(/!\[.*?\]\(.*?\)/g, "[image]") // Replace images
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Convert links to just text
        .replace(/#+\s*/g, "") // Remove markdown headers
        .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold
        .replace(/\*(.*?)\*/g, "$1") // Remove italic
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();

      const truncatedBody =
        cleanBody.length > 150
          ? cleanBody.substring(0, 150) + "..."
          : cleanBody;
      if (truncatedBody.length > 10) {
        // Only add if meaningful content remains
        issueText += `\n\nIssue Description:\n${truncatedBody}`;
      }
    }

    return issueText;
  }

  /**
   * Builds a summary section for multiple issues
   */
  private static buildIssuesSummary(issues: GitHubIssue[]): string {
    const openIssues = issues.filter((i) => i.state === "open");
    const closedIssues = issues.filter((i) => i.state === "closed");

    let summary = "\n\n📋 Referenced Issues Summary:\n";

    if (openIssues.length > 0) {
      summary += `Open Issues (${openIssues.length}):\n`;
      openIssues.forEach((issue) => {
        summary += `  • #${issue.number}: ${issue.title}\n`;
      });
    }

    if (closedIssues.length > 0) {
      summary += `✅ Closed Issues (${closedIssues.length}):\n`;
      closedIssues.forEach((issue) => {
        summary += `  • #${issue.number}: ${issue.title}\n`;
      });
    }

    return summary;
  }

  /**
   * Generates a descriptive title based on the original description and referenced issues
   */
  private static generateTitleFromIssues(
    originalDescription: string,
    issues: GitHubIssue[]
  ): string {
    // If there's only one issue, use it as the base for the title
    if (issues.length === 1) {
      const issue = issues[0];
      const action = this.extractActionFromDescription(originalDescription);
      return action
        ? `${action} #${issue.number}: ${issue.title.substring(0, 40)}${issue.title.length > 40 ? "..." : ""}`
        : `Work on #${issue.number}: ${issue.title.substring(0, 40)}${issue.title.length > 40 ? "..." : ""}`;
    }

    // Multiple issues - create a summary title
    if (issues.length > 1) {
      const action = this.extractActionFromDescription(originalDescription);
      const issueNumbers = issues.map((i) => `#${i.number}`).join(", ");
      return action
        ? `${action} multiple issues: ${issueNumbers}`
        : `Work on multiple issues: ${issueNumbers}`;
    }

    // Fallback to original description
    return (
      originalDescription.substring(0, 50) +
      (originalDescription.length > 50 ? "..." : "")
    );
  }

  /**
   * Extracts action words from the description to use in the title
   */
  private static extractActionFromDescription(
    description: string
  ): string | null {
    const actionWords = [
      "fix",
      "resolve",
      "address",
      "implement",
      "add",
      "create",
      "update",
      "refactor",
      "improve",
      "optimize",
      "debug",
      "test",
      "review",
    ];

    const words = description.toLowerCase().split(/\s+/);
    const foundAction = words.find((word) =>
      actionWords.some((action) => word.includes(action))
    );

    if (foundAction) {
      // Capitalize first letter
      return foundAction.charAt(0).toUpperCase() + foundAction.slice(1);
    }

    return null;
  }

  /**
   * Creates a plain text summary of referenced issues (for use in logs/debugging)
   */
  static createIssuesSummary(issues: GitHubIssue[]): string {
    if (issues.length === 0) return "No issues referenced.";

    let summary = `Referenced ${issues.length} issue${issues.length > 1 ? "s" : ""}:\n`;

    issues.forEach((issue) => {
      const status = issue.state === "open" ? "OPEN" : "CLOSED";
      const labels =
        issue.labels.length > 0
          ? ` (${issue.labels.map((l) => l.name).join(", ")})`
          : "";

      summary += `• #${issue.number} [${status}]: ${issue.title}${labels}\n`;

      if (issue.body && issue.body.trim()) {
        const shortBody = issue.body.trim().substring(0, 100);
        summary += `  └─ ${shortBody}${issue.body.length > 100 ? "..." : ""}\n`;
      }
    });

    return summary;
  }
}
