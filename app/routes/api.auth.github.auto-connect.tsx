import { ActionFunction, json } from "@remix-run/node";
import { getGitHubDevToken } from "~/lib/server/config";
import serverConfig from "~/lib/server/config";
import { parseCookies } from "~/lib/server/auth";

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return json(
      { error: "Auto-connect only available in development" },
      { status: 403 }
    );
  }

  try {
    const githubToken = getGitHubDevToken();

    if (!githubToken) {
      return json(
        { error: "No GitHub token found in environment variables" },
        { status: 400 }
      );
    }

    // Validate the token
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!userResponse.ok) {
      return json(
        { error: "Invalid GitHub token in environment" },
        { status: 400 }
      );
    }

    const userData = await userResponse.json();

    // Get user's primary email
    let userEmail = userData.email;
    if (!userEmail) {
      try {
        const emailResponse = await fetch(
          "https://api.github.com/user/emails",
          {
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          }
        );

        if (emailResponse.ok) {
          const emails = await emailResponse.json();
          const primaryEmail = emails.find((email: any) => email.primary);
          userEmail = primaryEmail?.email || emails[0]?.email;
        }
      } catch (emailError) {
        console.warn("Could not fetch user email:", emailError);
      }
    }

    // Get existing session cookie
    const cookieHeader = request.headers.get("Cookie");
    const cookies = parseCookies(cookieHeader || "");

    let existingCookieData: any = {};
    const existingAuthCookie = cookies[serverConfig.COOKIE_NAME];

    if (existingAuthCookie) {
      try {
        existingCookieData = JSON.parse(atob(existingAuthCookie));
      } catch (error) {
        console.warn("Could not parse existing auth cookie:", error);
      }
    }

    // Merge existing credentials with GitHub token
    let mergedCredentials: any = {};
    if (existingCookieData.enc) {
      try {
        mergedCredentials = JSON.parse(atob(existingCookieData.enc));
      } catch (error) {
        console.warn("Could not parse existing credentials:", error);
      }
    }

    mergedCredentials.gh = githubToken;

    // Create GitHub user info
    const githubUserInfo = {
      username: userData.login,
      name: userData.name || userData.login,
      email: userEmail,
      avatar_url: userData.avatar_url,
    };

    // Update session cookie
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const cookieData = {
      hasOpenAI: existingCookieData.hasOpenAI || false,
      hasHuggingFace: existingCookieData.hasHuggingFace || false,
      hasGitHub: true,
      expiresAt: existingCookieData.expiresAt || expiresAt.toISOString(),
      hfUserInfo: existingCookieData.hfUserInfo,
      githubUserInfo: btoa(JSON.stringify(githubUserInfo)),
      isOAuth2: existingCookieData.isOAuth2,
      isGitHubEnvVar: true, // Flag to indicate env var source
      enc: btoa(JSON.stringify(mergedCredentials)),
    };

    const cookieValue = btoa(JSON.stringify(cookieData));

    return json(
      {
        success: true,
        user: githubUserInfo,
        source: process.env.GH_TOKEN ? "GH_TOKEN" : "GITHUB_TOKEN",
      },
      {
        headers: {
          "Set-Cookie": `${serverConfig.COOKIE_NAME}=${cookieValue}; Max-Age=${7 * 24 * 60 * 60}; Path=/; HttpOnly=false; SameSite=Lax`,
        },
      }
    );
  } catch (error) {
    console.error("GitHub auto-connect error:", error);
    return json({ error: "Failed to auto-connect GitHub" }, { status: 500 });
  }
};
