import { useState, useEffect } from "react";
import {
  ConfigService,
  DockerConfig,
  DEFAULT_TEMPLATE,
} from "~/lib/configService";
import {
  AIProviderIcon,
  OpenAIIcon,
  ClaudeIcon,
} from "~/components/AIProviderIcons";
import { useAutoSave } from "~/hooks/useAutoSave";
import {
  AutoSaveService,
  STORAGE_KEYS,
  getFromLocalStorage,
  setToLocalStorage,
} from "~/lib/autoSaveService";

// Known environments with predefined configurations
export const KNOWN_ENVIRONMENTS = [
  {
    id: "hugex-codex",
    name: "hugex Codex (Recommended)",
    description: "Latest environment with enhanced AI coding capabilities",
    image: "drbh/codex-universal-explore:dev",
    tags: ["AI", "OpenAI", "Codex", "Coding", "Latest"],
    requiredSecrets: ["OPENAI_API_KEY"],
    defaultEnvironment: {
      LLM_MODEL: "gpt-4o",
      // LLM_PROVIDER: "openai",
      // CODEX_MODE: "enhanced",
    },
    icon: "openai",
    notes: {
      info: "Latest Codex Universal image with enhanced AI capabilities and improved code generation. Requires OpenAI API access.",
      link: "https://github.com/drbh/codex-universal",
    },
  },
  // {
  //   id: "hugex-chatgpt",
  //   name: "hugex ChatGPT (Legacy)",
  //   description: "Legacy environment for OpenAI ChatGPT models",
  //   image: "drbh/codex-universal-explore:alpha",
  //   tags: ["AI", "OpenAI", "ChatGPT", "Coding", "Legacy"],
  //   requiredSecrets: ["OPENAI_API_KEY"],
  //   defaultEnvironment: {
  //     LLM_MODEL: "gpt-4o",
  //     LLM_PROVIDER: "openai",
  //   },
  //   icon: "openai",
  //   notes: {
  //     info: "Legacy version of the Codex Universal image. Consider upgrading to the latest Codex environment for better performance.",
  //     link: "https://github.com/drbh/codex-universal",
  //   },
  // },
  // {
  //   id: "hugex-claude",
  //   name: "hugex Claude",
  //   description: "Environment optimized for Anthropic Claude models",
  //   image: "drbh/codex-universal-explore:alpha",
  //   tags: ["AI", "Anthropic", "Claude", "Coding"],
  //   requiredSecrets: ["ANTHROPIC_API_KEY"],
  //   defaultEnvironment: {
  //     LLM_MODEL: "claude-3-7-sonnet-20250219",
  //     LLM_PROVIDER: "anthropic",
  //   },
  //   icon: "claude",
  //   notes: {
  //     info: "This image is a custom version of the Codex Universal image, source available at drbh/codex-universal. It includes small modifications to support hugex",
  //     link: "https://github.com/drbh/codex-universal",
  //   },
  // },
  // {
  //   id: "custom",
  //   name: "Custom Environment",
  //   description: "Configure your own Docker environment",
  //   image: "ubuntu:latest",
  //   tags: ["Custom", "Docker", "Flexible"],
  //   requiredSecrets: [],
  //   defaultEnvironment: {},
  //   icon: "fas fa-cog",
  //   notes: {
  //     info: "Make sure the container expects PROMPT, REPO_URL and REPO_BRANCH environment variables to be set as well as exposing the git diff to the container logs to be compatible with hugex",
  //   },
  // },
];

interface ConfigurationPanelProps {
  onConfigChange?: () => void;
}

export const ConfigurationPanel = ({
  onConfigChange,
}: ConfigurationPanelProps) => {
  const [selectedEnvironment, setSelectedEnvironment] = useState(
    KNOWN_ENVIRONMENTS[0].id
  );
  const [dockerConfig, setDockerConfig] = useState<DockerConfig>({
    image: "drbh/codex-universal-explore:latest",
    environment: {},
    secrets: {},
  });
  const [isExpanded, setIsExpanded] = useState(true);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [newSecretKey, setNewSecretKey] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [templateText, setTemplateText] = useState(DEFAULT_TEMPLATE);

  // Auto-save configuration changes
  const dockerAutoSave = useAutoSave([dockerConfig], {
    delay: 500, // Much faster - 500ms
    onSave: async () => {
      await ConfigService.updateDockerConfig(dockerConfig);
      onConfigChange?.();
    },
    onSuccess: () => {
      // No intrusive success message, just console log
      console.log("Configuration auto-saved successfully");
    },
    onError: (error) => {
      // Only show errors, not success
      AutoSaveService.showSaveIndicator(
        "Failed to save configuration",
        "error"
      );
      console.error("Auto-save failed:", error);
    },
    enabled: true,
  });

  // Load configuration from localStorage
  const loadLocalConfiguration = () => {
    try {
      const savedConfig = getFromLocalStorage(STORAGE_KEYS.dockerConfig, null);
      if (savedConfig) {
        setDockerConfig(savedConfig);

        // Detect which environment matches the current docker image
        const matchingEnv = KNOWN_ENVIRONMENTS.find(
          (env) => env.image === savedConfig.image
        );
        if (matchingEnv) {
          setSelectedEnvironment(matchingEnv.id);
        } else {
          setSelectedEnvironment("custom");
        }
      }

      const savedTemplateText = getFromLocalStorage(
        STORAGE_KEYS.templateText,
        DEFAULT_TEMPLATE
      );
      setTemplateText(savedTemplateText);
    } catch (error) {
      console.error("Failed to load local configuration:", error);
    }
  };

  // Save configuration to localStorage with auto-save
  const saveLocalConfiguration = (config: DockerConfig) => {
    setToLocalStorage(STORAGE_KEYS.dockerConfig, config, true);
  };

  useEffect(() => {
    // First load from localStorage for immediate UX
    loadLocalConfiguration();
    // Then load from server for sync
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      const dockerData = await ConfigService.getDockerConfig();
      setDockerConfig(dockerData);

      // Detect which environment matches the current docker image
      const matchingEnv = KNOWN_ENVIRONMENTS.find(
        (env) => env.image === dockerData.image
      );
      if (matchingEnv) {
        setSelectedEnvironment(matchingEnv.id);
      } else {
        // If no match found, default to custom
        setSelectedEnvironment("custom");
      }

      // Save to localStorage for persistence
      saveLocalConfiguration(dockerData);
    } catch (error) {
      console.error("Failed to load configuration:", error);
    }
  };

  const validateGitUrl = (url: string): boolean => {
    // This function is deprecated but kept for potential future use
    const gitUrlPattern =
      /^https:\/\/github\.com\/[\w\-\.]+\/[\w\-\.]+(?:\.git)?(?:\/)?$/;
    return gitUrlPattern.test(url);
  };

  const handleRepoUrlChange = (url: string) => {
    // Repository configuration is now handled per-job in the create task form
    console.warn("Repository URL change ignored - deprecated functionality");
  };

  const handleSaveRepoConfig = async () => {
    // Repository configuration is now handled per-job in the create task form
    console.warn("Repository save ignored - deprecated functionality");
  };

  const handleExecutionModeChange = async (newMode: string) => {
    // Execution mode is now always 'api' - Docker mode has been deprecated
    console.warn("Execution mode change ignored - always using 'api' mode");
  };

  const showSuccessMessage = (message: string, bgColor = "bg-green-500") => {
    const successMessage = document.createElement("div");
    successMessage.className = `fixed top-4 right-4 ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg z-50`;
    successMessage.textContent = message;
    document.body.appendChild(successMessage);

    setTimeout(() => {
      document.body.removeChild(successMessage);
    }, 3000);
  };

  const addEnvironmentVariable = () => {
    if (newEnvKey.trim() && newEnvValue.trim()) {
      const newConfig = {
        ...dockerConfig,
        environment: {
          ...dockerConfig.environment,
          [newEnvKey.trim()]: newEnvValue.trim(),
        },
      };
      setDockerConfig(newConfig);
      saveLocalConfiguration(newConfig);
      setNewEnvKey("");
      setNewEnvValue("");
    }
  };

  const removeEnvironmentVariable = (key: string) => {
    const newConfig = {
      ...dockerConfig,
      environment: { ...dockerConfig.environment },
    };
    delete newConfig.environment[key];
    setDockerConfig(newConfig);
    saveLocalConfiguration(newConfig);
  };

  const addSecret = () => {
    if (newSecretKey.trim() && newSecretValue.trim()) {
      const newConfig = {
        ...dockerConfig,
        secrets: {
          ...dockerConfig.secrets,
          [newSecretKey.trim()]: newSecretValue.trim(),
        },
      };
      setDockerConfig(newConfig);
      saveLocalConfiguration(newConfig);
      setNewSecretKey("");
      setNewSecretValue("");
    }
  };

  const removeSecret = (key: string) => {
    const newConfig = {
      ...dockerConfig,
      secrets: { ...dockerConfig.secrets },
    };
    delete newConfig.secrets[key];
    setDockerConfig(newConfig);
    saveLocalConfiguration(newConfig);
  };

  const handleEnvironmentSelect = (envId: string) => {
    const env = KNOWN_ENVIRONMENTS.find((e) => e.id === envId);
    if (env) {
      setSelectedEnvironment(envId);
      const newConfig = {
        ...dockerConfig,
        image: env.image,
        environment: { ...dockerConfig.environment, ...env.defaultEnvironment },
      };
      setDockerConfig(newConfig);
      saveLocalConfiguration(newConfig);
    }
  };

  return (
    <div className="p-6">
      <div className="space-y-6">
        {/* Environment Selection */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Select Environment
          </h2>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {KNOWN_ENVIRONMENTS.map((env) => {
              const isSelected = selectedEnvironment === env.id;
              const hasRequiredSecrets = env.requiredSecrets.every(
                (secret) => dockerConfig.secrets[secret]
              );

              return (
                <div
                  key={env.id}
                  onClick={() => handleEnvironmentSelect(env.id)}
                  className={`cursor-pointer rounded-lg border p-4 transition-all hover:shadow-md ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`rounded-lg p-2 ${
                        isSelected
                          ? "bg-blue-100 dark:bg-blue-800"
                          : "bg-gray-100 dark:bg-gray-700"
                      }`}
                    >
                      {env.icon === "openai" ? (
                        <OpenAIIcon
                          className={
                            isSelected
                              ? "text-blue-600 dark:text-blue-300"
                              : "text-gray-600 dark:text-gray-300"
                          }
                          size={20}
                        />
                      ) : env.icon === "claude" ? (
                        <ClaudeIcon
                          className={
                            isSelected
                              ? "text-blue-600 dark:text-blue-300"
                              : "text-gray-600 dark:text-gray-300"
                          }
                          size={20}
                        />
                      ) : (
                        <i
                          className={`${env.icon} text-lg ${
                            isSelected
                              ? "text-blue-600 dark:text-blue-300"
                              : "text-gray-600 dark:text-gray-300"
                          }`}
                        ></i>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="mb-2 flex items-center justify-between">
                        <h3
                          className={`flex items-center gap-2 font-medium ${
                            isSelected
                              ? "text-blue-900 dark:text-blue-100"
                              : "text-gray-900 dark:text-gray-100"
                          }`}
                        >
                          {env.name}
                          {env.id === "hugex-codex" && (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                              <i className="fas fa-star mr-1 text-xs"></i>
                              Recommended
                            </span>
                          )}
                          {env.tags.includes("Legacy") && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              Legacy
                            </span>
                          )}
                        </h3>
                        {isSelected && (
                          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <i className="fas fa-check-circle text-sm"></i>
                            <span className="text-xs font-medium">
                              Selected
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                        {env.description}
                      </p>

                      {/* Tags */}
                      <div className="mb-2 flex flex-wrap gap-1">
                        {env.tags.map((tag) => {
                          const aiIcon = AIProviderIcon({
                            tags: [tag],
                            size: 12,
                          });
                          return (
                            <span
                              key={tag}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                                isSelected
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {aiIcon && (
                                <span className="flex items-center">
                                  {aiIcon}
                                </span>
                              )}
                              {tag}
                            </span>
                          );
                        })}
                      </div>

                      {/* Required secrets indicator */}
                      {env.requiredSecrets.length > 0 && (
                        <div
                          className={`flex items-center gap-1 text-xs ${
                            hasRequiredSecrets
                              ? "text-green-600 dark:text-green-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          <i
                            className={`fas ${
                              hasRequiredSecrets
                                ? "fa-check-circle"
                                : "fa-exclamation-triangle"
                            }`}
                          ></i>
                          <span>
                            {hasRequiredSecrets
                              ? "All required secrets configured"
                              : `Requires: ${env.requiredSecrets.join(", ")}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <hr className="mb-6 border-gray-200 dark:border-gray-700" />
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Details
            </h2>
            {(() => {
              const currentEnv = KNOWN_ENVIRONMENTS.find(
                (env) => env.id === selectedEnvironment
              );
              if (currentEnv && currentEnv.requiredSecrets.length > 0) {
                const missingSecrets = currentEnv.requiredSecrets.filter(
                  (secret) => !dockerConfig.secrets[secret]
                );
                if (missingSecrets.length > 0) {
                  return (
                    <div className="flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 dark:border-amber-800 dark:bg-amber-900/20">
                      <i className="fas fa-exclamation-triangle text-xs text-amber-600 dark:text-amber-400"></i>
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        {missingSecrets.length} missing
                      </span>
                    </div>
                  );
                }
              }

              // Check if Docker image is empty or default
              if (
                !dockerConfig.image ||
                dockerConfig.image === "ubuntu:latest"
              ) {
                return (
                  <div className="flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 dark:border-blue-800 dark:bg-blue-900/20">
                    <i className="fas fa-info-circle text-xs text-blue-600 dark:text-blue-400"></i>
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Needs setup
                    </span>
                  </div>
                );
              }

              return (
                <div className="flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 dark:border-green-800 dark:bg-green-900/20">
                  <i className="fas fa-check-circle text-xs text-green-600 dark:text-green-400"></i>
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">
                    Ready
                  </span>
                </div>
              );
            })()}
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            {isExpanded ? (
              <i className="fas fa-chevron-up"></i>
            ) : (
              <i className="fas fa-chevron-down"></i>
            )}
          </button>
        </div>

        {/* Docker Configuration */}
        <div className={`space-y-6 ${isExpanded ? "block" : "hidden"}`}>
          {/* Docker Image */}
          <div>
            <label
              htmlFor="docker-image"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Docker Image
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                id="docker-image"
                value={dockerConfig.image}
                onChange={(e) => {
                  const newImage = e.target.value;
                  setDockerConfig((prev) => ({
                    ...prev,
                    image: newImage,
                  }));

                  // Update selected environment when image changes
                  const matchingEnv = KNOWN_ENVIRONMENTS.find(
                    (env) => env.image === newImage
                  );
                  if (matchingEnv) {
                    setSelectedEnvironment(matchingEnv.id);
                  } else {
                    setSelectedEnvironment("custom");
                  }
                }}
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                placeholder="docker/image:tag"
              />
              {/* Subtle auto-save status indicator positioned better */}
              <div className="flex h-6 w-6 items-center justify-center">
                {dockerAutoSave.isAutoSaving && (
                  <div
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400"
                    title="Saving..."
                  ></div>
                )}

                {dockerAutoSave.hasUnsavedChanges &&
                !dockerAutoSave.isAutoSaving ? (
                  <div
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"
                    title="Pending save..."
                  ></div>
                ) : (
                  !dockerAutoSave.isAutoSaving &&
                  dockerAutoSave.lastSaved && (
                    <div
                      className="h-1.5 w-1.5 rounded-full bg-green-400 opacity-50"
                      title="Saved"
                    ></div>
                  )
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Specify the Docker image to use for job execution
            </p>

            {/* Show environment-specific notes */}
            {(() => {
              const currentEnv = KNOWN_ENVIRONMENTS.find(
                (env) => env.id === selectedEnvironment
              );
              if (
                currentEnv &&
                currentEnv.notes &&
                dockerConfig.image === currentEnv.image
              ) {
                return (
                  <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                    Note: {currentEnv.notes.info}
                    {currentEnv.notes.link && (
                      <>
                        {" "}
                        <a
                          href={currentEnv.notes.link}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {currentEnv.notes.link.replace(
                            "https://github.com/",
                            ""
                          )}
                        </a>
                      </>
                    )}
                  </p>
                );
              }
              return null;
            })()}
          </div>

          {/* Prompt Template */}
          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Prompt Template
            </label>
            <input
              type="text"
              value={templateText}
              onChange={(e) => {
                setTemplateText(e.target.value);
                setToLocalStorage(
                  STORAGE_KEYS.templateText,
                  e.target.value,
                  true
                );
                onConfigChange?.(); // Notify parent of template change
              }}
              placeholder="Enter instruction to append to all prompts (leave empty to disable)"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              This instruction will be automatically appended to all task
              prompts when not empty
            </p>
          </div>

          {/* Environment Variables */}
          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Environment Variables
            </label>
            <div className="space-y-2">
              {Object.entries(dockerConfig.environment).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={key}
                    disabled
                    className="w-1/3 rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    value={value}
                    disabled
                    className="flex-1 rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-100"
                  />
                  <button
                    onClick={() => removeEnvironmentVariable(key)}
                    className="rounded-md border border-red-300 px-3 py-2 text-red-300 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-900 dark:hover:bg-gray-800"
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.target.value)}
                  placeholder="KEY"
                  className="w-1/3 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                />
                <input
                  type="text"
                  value={newEnvValue}
                  onChange={(e) => setNewEnvValue(e.target.value)}
                  placeholder="Value"
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                />
                <button
                  onClick={addEnvironmentVariable}
                  disabled={!newEnvKey.trim() || !newEnvValue.trim()}
                  className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <i className="fas fa-plus"></i>
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Add custom environment variables for the Docker container
            </p>
          </div>

          {/* Secrets */}
          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Secrets
            </label>

            {/* Quick Add Common Secrets */}
            {/* <div className="mb-3 flex flex-wrap gap-2">
                      {[
                        { key: 'OPENAI_API_KEY', placeholder: 'sk-...', icon: 'fas fa-brain' },
                        { key: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-...', icon: 'fas fa-robot' },
                        { key: 'GITHUB_TOKEN', placeholder: 'ghp_...', icon: 'fab fa-github' },
                      ].map(({ key, placeholder, icon }) => (
                        !dockerConfig.secrets[key] && (
                          <button
                            key={key}
                            onClick={() => {
                              setNewSecretKey(key);
                              // Focus the value input
                              setTimeout(() => {
                                const valueInput = document.querySelector('input[placeholder="Secret value"]') as HTMLInputElement;
                                if (valueInput) valueInput.focus();
                              }, 0);
                            }}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                          >
                            <i className={`${icon} text-xs`}></i>
                            Add {key.replace('_', ' ')}
                          </button>
                        )
                      ))}
                    </div> */}

            <div className="space-y-2">
              {Object.entries(dockerConfig.secrets).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={key}
                    disabled
                    className="w-1/3 rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-100"
                  />
                  <input
                    type="password"
                    value="••••••••"
                    disabled
                    className="flex-1 rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-100"
                  />
                  <button
                    onClick={() => removeSecret(key)}
                    className="rounded-md border border-red-300 px-3 py-2 text-red-300 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-900 dark:hover:bg-gray-800"
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSecretKey}
                  onChange={(e) => setNewSecretKey(e.target.value)}
                  placeholder={(() => {
                    const currentEnv = KNOWN_ENVIRONMENTS.find(
                      (env) => env.id === selectedEnvironment
                    );
                    if (currentEnv && currentEnv.requiredSecrets.length > 0) {
                      const missingRequired = currentEnv.requiredSecrets.find(
                        (secret) => !dockerConfig.secrets[secret]
                      );
                      if (missingRequired) {
                        return missingRequired;
                      }
                    }
                    return "SECRET_NAME";
                  })()}
                  className="w-1/3 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                />
                <input
                  type="password"
                  value={newSecretValue}
                  onChange={(e) => setNewSecretValue(e.target.value)}
                  placeholder="Secret value"
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                />
                <button
                  onClick={addSecret}
                  disabled={!newSecretKey.trim() || !newSecretValue.trim()}
                  className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <i className="fas fa-plus"></i>
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Add sensitive configuration values as secrets
            </p>
            {(() => {
              const currentEnv = KNOWN_ENVIRONMENTS.find(
                (env) => env.id === selectedEnvironment
              );
              if (currentEnv && currentEnv.requiredSecrets.length > 0) {
                const missingSecrets = currentEnv.requiredSecrets.filter(
                  (secret) => !dockerConfig.secrets[secret]
                );
                if (missingSecrets.length > 0) {
                  return (
                    <p className="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                      <i className="fas fa-exclamation-triangle"></i>
                      {missingSecrets.join(", ")} required for {currentEnv.name}
                    </p>
                  );
                }
              }
              return null;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};
