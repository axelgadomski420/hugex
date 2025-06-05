import { redirect } from "@remix-run/node";
import serverConfig from "./config";

interface ApiCredentials {
  openaiApiKey?: string;
  huggingfaceToken?: string;
  githubToken?: string;
  hfUserInfo?: {
    username: string;
    [key: string]: any;
  };
  githubUserInfo?: {
    username: string;
    name?: string;
    email?: string;
    avatar_url?: string;
    [key: string]: any;
  };
}

export function extractCredentialsFromCookie(
  cookieHeader: string | null
): ApiCredentials {
  if (!cookieHeader) {
    return {};
  }

  try {
    // Parse cookies
    const cookies = parseCookies(cookieHeader);

    // Get the encoded cookie name
    const encodedCookieName = encodeURIComponent(serverConfig.COOKIE_NAME);
    const authCookie = cookies[encodedCookieName];

    if (!authCookie) {
      return {};
    }

    // console.log("Auth cookie found. Attempting to decode...");

    // Decode the URL encoded cookie value first
    const decodedCookie = decodeURIComponent(authCookie);

    // Then decode the base64 and parse the JSON
    const cookieData = JSON.parse(
      Buffer.from(decodedCookie, "base64").toString()
    );

    const credentials: ApiCredentials = {};

    if (cookieData.enc) {
      // Decode the credentials inside the cookie
      const creds = JSON.parse(
        Buffer.from(cookieData.enc, "base64").toString()
      );

      credentials.huggingfaceToken = creds.hf;
      credentials.githubToken = creds.gh;
      // OpenAI is no longer stored in cookies
    }

    // Extract user info if available
    if (cookieData.hfUserInfo) {
      try {
        const userInfo = JSON.parse(
          Buffer.from(cookieData.hfUserInfo, "base64").toString()
        );
        credentials.hfUserInfo = userInfo;
        // console.log(
        //   "Successfully extracted HF user info from cookie:",
        //   userInfo.username
        // );
      } catch (err) {
        console.error("Error parsing HF user info:", err);
      }
    }

    // Extract GitHub user info if available
    if (cookieData.githubUserInfo) {
      try {
        const githubUserInfo = JSON.parse(
          Buffer.from(cookieData.githubUserInfo, "base64").toString()
        );
        credentials.githubUserInfo = githubUserInfo;
      } catch (err) {
        console.error("Error parsing GitHub user info:", err);
      }
    }

    // console.log("Successfully extracted API credentials from cookie");
    return credentials;
  } catch (error) {
    console.error("Failed to parse auth cookie:", error);
    return {};
  }
}

export function requireAuthentication(request: Request): ApiCredentials {
  const cookieHeader = request.headers.get("Cookie");
  const credentials = extractCredentialsFromCookie(cookieHeader);

  if (!credentials.huggingfaceToken) {
    throw redirect("/", {
      status: 401,
      headers: {
        "Set-Cookie":
          "auth_error=Authentication required; Path=/; HttpOnly; SameSite=Lax",
      },
    });
  }

  return credentials;
}

export function hasValidCredentials(credentials: ApiCredentials): boolean {
  // In Docker mode, allow access with any valid authentication (HF or GitHub)
  if (serverConfig.EXECUTION_MODE === "docker") {
    // Allow access with either HuggingFace token or GitHub token
    return !!credentials.huggingfaceToken || !!credentials.githubToken;
  }
  // In API mode, require HuggingFace token for job execution
  return !!credentials.huggingfaceToken;
}

export function hasGitHubCredentials(credentials: ApiCredentials): boolean {
  return !!credentials.githubToken && !!credentials.githubUserInfo;
}

export function getEffectiveUsername(
  credentials: ApiCredentials
): string | undefined {
  // Prefer HuggingFace username for job execution, fallback to GitHub username
  return (
    credentials.hfUserInfo?.username || credentials.githubUserInfo?.username
  );
}

export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.split("=");
    const value = rest.join("=");
    if (name && value) {
      cookies[name.trim()] = value.trim();
    }
  });

  return cookies;
}

export function isPublicPath(pathname: string): boolean {
  const publicPaths = ["/health", "/api/config/execution-mode"];
  return publicPaths.includes(pathname);
}
