import { LoaderFunction, json } from "@remix-run/node";
import serverConfig from "~/lib/server/config";

export const loader: LoaderFunction = async () => {
  return json({
    oauth2Enabled: serverConfig.OAUTH2.ENABLED,
    githubOAuth2Enabled: serverConfig.GITHUB_OAUTH2.ENABLED,
    providerName: "HuggingFace",
  });
};
