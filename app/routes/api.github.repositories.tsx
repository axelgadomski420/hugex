import { LoaderFunction, json } from "@remix-run/node";
import { extractCredentialsFromCookie } from "~/lib/server/auth";
import { GitHubAPIService } from "~/lib/githubAPIService";

export const loader: LoaderFunction = async ({ request }) => {
  try {
    // Check authentication and GitHub connection
    const cookieHeader = request.headers.get("Cookie");
    const credentials = extractCredentialsFromCookie(cookieHeader);

    if (!credentials.githubToken) {
      return json(
        {
          error: "GitHub not connected",
          repositories: [],
        },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const searchQuery = url.searchParams.get("search");
    const type =
      (url.searchParams.get("type") as "all" | "owner" | "member") || "all";
    const page = parseInt(url.searchParams.get("page") || "1");

    let repositories;

    if (searchQuery) {
      // Search repositories
      repositories = await GitHubAPIService.searchUserRepositories(
        credentials.githubToken,
        searchQuery,
        credentials.githubUserInfo?.username
      );
    } else {
      // Get user repositories
      repositories = await GitHubAPIService.getUserRepositories(
        credentials.githubToken,
        {
          type,
          sort: "updated",
          direction: "desc",
          per_page: 50,
          page,
        }
      );
    }

    return json({
      repositories,
      user: credentials.githubUserInfo,
    });
  } catch (error) {
    console.error("Error fetching GitHub repositories:", error);
    return json(
      {
        error: "Failed to fetch repositories",
        repositories: [],
      },
      { status: 500 }
    );
  }
};
