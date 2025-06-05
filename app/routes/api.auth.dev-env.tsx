import { LoaderFunction, json } from "@remix-run/node";
import serverConfig from "~/lib/server/config";

export const loader: LoaderFunction = async () => {
  console.log("Loading development environment credentials");
  // Only return dev credentials in development mode
  if (process.env.NODE_ENV !== "development") {
    return json({
      isDevelopment: false,
      openaiKey: null,
      huggingfaceToken: null,
    });
  }

  console.log("Returning development environment credentials");
  return json({
    isDevelopment: true,
    openaiKey: serverConfig.DEVELOPMENT.OPENAI_API_KEY || null,
    huggingfaceToken: serverConfig.DEVELOPMENT.HUGGINGFACE_TOKEN || null,
  });
};
