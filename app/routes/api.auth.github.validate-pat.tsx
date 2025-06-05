import { ActionFunction, json } from "@remix-run/node";

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { token } = await request.json();

    // tokens start with ghp_ or github_pat
    if (
      !token ||
      (!token.startsWith("ghp_") && !token.startsWith("github_pat"))
    ) {
      console.log("Invalid token format");

      return json(
        {
          error:
            'Invalid token format. GitHub Personal Access Tokens should start with "ghp_"',
        },
        { status: 400 }
      );
    }

    // Validate token by making a test API call
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return json({ error: "Invalid or expired token" }, { status: 400 });
      }
      return json(
        { error: "Failed to validate token with GitHub" },
        { status: 400 }
      );
    }

    const userData = await response.json();

    // Check if token has repo scope by testing access to a private repo endpoint
    const scopeResponse = await fetch(
      "https://api.github.com/user/repos?type=private&per_page=1",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!scopeResponse.ok) {
      return json(
        {
          error:
            'Token does not have required "repo" scope. Please create a new token with repo access.',
        },
        { status: 400 }
      );
    }

    return json({
      valid: true,
      user: {
        username: userData.login,
        name: userData.name || userData.login,
        avatar_url: userData.avatar_url,
      },
    });
  } catch (error) {
    console.error("PAT validation error:", error);
    return json({ error: "Failed to validate token" }, { status: 500 });
  }
};
