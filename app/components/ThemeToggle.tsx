import { useTheme } from "~/lib/theme";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycleTheme = () => {
    const themes: Array<"light" | "dark" | "system"> = [
      "light",
      "dark",
      "system",
    ];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const getIcon = () => {
    if (theme === "system") {
      return <i className="fas fa-desktop"></i>;
    }

    if (resolvedTheme === "dark") {
      return <i className="fas fa-moon"></i>;
    }

    return <i className="fas fa-sun"></i>;
  };

  const getLabel = () => {
    switch (theme) {
      case "light":
        return "Light mode";
      case "dark":
        return "Dark mode";
      case "system":
        return "System theme";
      default:
        return "Toggle theme";
    }
  };

  return (
    <button
      onClick={cycleTheme}
      className="
        inline-flex items-center justify-center rounded-md p-2
        text-gray-600 transition-colors duration-200
        hover:bg-gray-100 hover:text-gray-900 focus:outline-none
        focus:ring-2 focus:ring-blue-500
        focus:ring-offset-2 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100
        dark:focus:ring-offset-gray-900
      "
      title={getLabel()}
      aria-label={getLabel()}
    >
      {getIcon()}
    </button>
  );
}
