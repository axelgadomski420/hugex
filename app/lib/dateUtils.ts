export const formatRelativeDate = (date: Date | string): string => {
  const now = new Date();
  const targetDate = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - targetDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60)
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }

  return targetDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year:
      now.getFullYear() !== targetDate.getFullYear() ? "numeric" : undefined,
  });
};

export const formatFullDate = (date: Date | string): string => {
  const targetDate = typeof date === "string" ? new Date(date) : date;

  return targetDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatShortDate = (date: Date | string): string => {
  const targetDate = typeof date === "string" ? new Date(date) : date;

  return targetDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
};

export const isToday = (date: Date | string): boolean => {
  const targetDate = typeof date === "string" ? new Date(date) : date;
  const today = new Date();

  return targetDate.toDateString() === today.toDateString();
};

export const isYesterday = (date: Date | string): boolean => {
  const targetDate = typeof date === "string" ? new Date(date) : date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return targetDate.toDateString() === yesterday.toDateString();
};
