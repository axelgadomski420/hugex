import { ActionFunction, json } from "@remix-run/node";
import serverConfig from "~/lib/server/config";
import {
  extractCredentialsFromCookie,
  hasValidCredentials,
  hasGitHubCredentials,
} from "~/lib/server/auth";

export interface ApiCredentials {
  openaiApiKey: string;
  huggingfaceToken: string;
  hfUserInfo: HFUserInfo;
}

export interface HFUserInfo {
  username: string;
  fullName: string;
  avatarUrl: string;
}

export interface AuthRequest {
  action: "authenticate" | "logout" | "verify";
  credentials?: {
    openaiApiKey?: string;
    huggingfaceToken?: string;
  };
}

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export const action: ActionFunction = async ({ request }) => {
  const body: AuthRequest = await request.json();

  switch (body.action) {
    case "authenticate":
      return await handleAuthenticate(body.credentials, request);
    case "logout":
      return handleLogout();
    case "verify":
      return await handleVerify(request);
    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
};

async function handleAuthenticate(
  credentials: AuthRequest["credentials"],
  request: Request
) {
  if (!credentials) {
    return json({ error: "No credentials provided" }, { status: 400 });
  }

  try {
    // Validate credentials format
    if (!validateCredentials(credentials)) {
      return json({ error: "Invalid credentials format" }, { status: 400 });
    }

    // Test credentials with API calls
    const testResult = await testCredentials(credentials);
    if (!testResult.isValid) {
      return json({ error: "Invalid API credentials" }, { status: 401 });
    }

    // Create cookie data
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + COOKIE_MAX_AGE * 1000);

    const cookieData = {
      hasOpenAI: false, // OpenAI is now handled as a regular secret, not in auth
      hasHuggingFace: true,
      expiresAt: expiresAt.toISOString(),
      hfUserInfo: testResult.hfUserInfo
        ? btoa(JSON.stringify(testResult.hfUserInfo))
        : null,
      // Store encrypted HuggingFace token only
      enc: btoa(
        JSON.stringify({
          hf: credentials.huggingfaceToken || "",
        })
      ),
    };

    // Create cookie value
    const cookieValue = btoa(JSON.stringify(cookieData));

    // Set cookie with proper headers
    const headers = new Headers();

    // Determine if we should use Secure flag
    const url = new URL(request.url);
    const isSecure = url.protocol === "https:";

    // const cookieOptions = [
    //   `${config.COOKIE_NAME}=${cookieValue}`,
    //   `Max-Age=${COOKIE_MAX_AGE}`,
    //   "Path=/",
    //   // "SameSite=None",
    //   // "HttpOnly=false", // Need to access from client-side
    // ];
    // // const cookieOptions = [
    // //   `${config.COOKIE_NAME}=${cookieValue}`,
    // //   `Max-Age=${COOKIE_MAX_AGE}`,
    // //   "Path=/",
    // //   "SameSite=Lax",
    // //   "HttpOnly=false", // Need to access from client-side
    // // ];

    // if (isSecure) {
    //   cookieOptions.push("Secure");
    // }

    const cookieOptions = [
      `${serverConfig.COOKIE_NAME}=${cookieValue}`,
      `Max-Age=${COOKIE_MAX_AGE}`,
      "Path=/",
      // "SameSite=Lax", // Lax is more compatible than None
      "SameSite=None", // Lax is more compatible than None
      // Don't set HttpOnly to allow client-side access
      "Secure", // Only set Secure in HTTPS environments
      "HttpOnly=true", // Allow client-side access
    ];

    // Only add Secure in production HTTPS environments
    if (isSecure) {
      cookieOptions.push("Secure");
    }

    // // For HTTPS environments
    // if (isSecure) {
    //   cookieOptions.push("Secure");
    //   cookieOptions.push("SameSite=None"); // When Secure is used, SameSite=None allows cross-origin requests
    // } else {
    //   cookieOptions.push("SameSite=Lax"); // For non-HTTPS environments
    // }

    headers.set("Set-Cookie", cookieOptions.join("; "));

    return json(
      {
        success: true,
        authStatus: {
          isAuthenticated: true,
          hasOpenAI: false, // OpenAI is now a regular secret
          hasHuggingFace: true,
          expiresAt,
          hfUserInfo: testResult.hfUserInfo,
        },
      },
      { headers }
    );
  } catch (error) {
    console.error("Authentication failed:", error);
    return json({ error: "Authentication failed" }, { status: 500 });
  }
}

function handleLogout() {
  const headers = new Headers();

  // Clear cookie by setting it to expire
  const cookieOptions = [
    `${serverConfig.COOKIE_NAME}=`,
    "expires=Thu, 01 Jan 1970 00:00:00 UTC",
    "Path=/",
    "SameSite=None", // Allow cross-origin requests
    "Secure", // Only set Secure in HTTPS environments
    "HttpOnly=true", // Allow client-side access
  ];

  headers.set("Set-Cookie", cookieOptions.join("; "));

  return json(
    { success: true, message: "Logged out successfully" },
    { headers }
  );
}

async function handleVerify(request: Request) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return json({
      isAuthenticated: false,
      hasOpenAI: false,
      hasHuggingFace: false,
      hasGitHub: false,
    });
  }

  // Use the improved credential extraction logic
  const credentials = extractCredentialsFromCookie(cookieHeader);

  // Check if the user has valid credentials (HF or GitHub in Docker mode)
  const isAuthenticated = hasValidCredentials(credentials);
  const hasGitHub = hasGitHubCredentials(credentials);
  const hasHuggingFace = !!credentials.huggingfaceToken;

  if (!isAuthenticated) {
    return json({
      isAuthenticated: false,
      hasOpenAI: false,
      hasHuggingFace: false,
      hasGitHub: false,
    });
  }

  return json({
    isAuthenticated: true,
    hasOpenAI: false, // OpenAI is handled as a regular secret now
    hasHuggingFace,
    hasGitHub,
    hfUserInfo: credentials.hfUserInfo,
    githubUserInfo: credentials.githubUserInfo,
  });
}

function validateCredentials(credentials: any): boolean {
  // OpenAI API key validation (starts with sk-) - optional
  if (credentials.openaiApiKey && !credentials.openaiApiKey.startsWith("sk-")) {
    return false;
  }

  // HuggingFace token validation (starts with hf_) - required
  if (
    !credentials.huggingfaceToken ||
    !credentials.huggingfaceToken.startsWith("hf_")
  ) {
    return false;
  }

  return true;
}

async function testCredentials(credentials: any): Promise<{
  isValid: boolean;
  hfUserInfo?: HFUserInfo;
}> {
  let hfUserInfo: HFUserInfo | undefined;

  // Test HuggingFace API - required
  try {
    hfUserInfo = await testHuggingFaceToken(credentials.huggingfaceToken);
    if (!hfUserInfo) {
      return { isValid: false };
    }
  } catch (error) {
    return { isValid: false };
  }

  // OpenAI key validation is optional - we assume it's valid if provided
  // to avoid rate limiting issues

  return { isValid: true, hfUserInfo };
}

async function testHuggingFaceToken(token: string): Promise<HFUserInfo | null> {
  try {
    const response = await fetch("https://huggingface.co/api/whoami-v2", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error("HuggingFace API response not OK:", response.status);
      return null;
    }

    const data = await response.json();

    return {
      username: data.name || "",
      fullName: data.fullname || "",
      avatarUrl: data.avatarUrl || "",
    };
  } catch (error) {
    console.error("HuggingFace API test failed:", error);
    return null;
  }
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name && rest.length > 0) {
      // Handle both encoded and non-encoded cookie names
      const decodedName = decodeURIComponent(name);
      const cookieValue = rest.join("=");
      cookies[name] = cookieValue; // Store with original name
      cookies[decodedName] = cookieValue; // Store with decoded name
    }
  });

  return cookies;
}
