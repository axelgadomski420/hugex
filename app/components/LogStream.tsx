import { useEffect, useState, useRef } from "react";

interface LogStreamProps {
  jobId: string;
  className?: string;
}

// Function to parse and colorize terminal output
const parseTerminalOutput = (text: string) => {
  const lines = text.split("\n");
  return lines.map((line, index) => {
    let className = "text-gray-200"; // Default color
    let content = line;

    // // Error patterns (red)
    // if (line.match(/error|Error|ERROR|fail|Failed|FAILED|exception|Exception|panic/i)) {
    //   className = 'text-red-400';
    // }
    // // Warning patterns (yellow)
    // else if (line.match(/warn|Warning|WARNING|deprecated|DEPRECATED/i)) {
    //   className = 'text-yellow-400';
    // }
    // // Success patterns (green)
    // else if (line.match(/success|Success|SUCCESS|complete|Complete|COMPLETE|done|Done|DONE|✓|✔/i)) {
    //   className = 'text-green-400';
    // }
    // // File paths (cyan)
    // else if (line.match(/\.(js|ts|tsx|jsx|py|go|rs|java|cpp|c|h|css|html|json|yaml|yml|md|txt|log)\b/)) {
    //   className = 'text-cyan-400';
    // }
    // // URLs and HTTP (blue)
    // else if (line.match(/https?:\/\/|HTTP|GET|POST|PUT|DELETE|PATCH/)) {
    //   className = 'text-blue-400';
    // }
    // // Numbers and values (magenta)
    // else if (line.match(/^\s*\d+\s|\b\d+\.\d+\b|\b\d+%\b|\b\d+ms\b|\b\d+s\b/)) {
    //   className = 'text-purple-400';
    // }
    // // Commands and executables (bright blue)
    // else if (line.match(/^\$\s|^>\s|npm |yarn |pnpm |git |docker |node |python |pip |cargo |go |rustc /)) {
    //   className = 'text-blue-300';
    // }
    // // Timestamps (gray)
    // else if (line.match(/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|\[\d+\]/)) {
    //   className = 'text-gray-400';
    // }
    // // Comments and info (dim)
    // else if (line.match(/^#|^\/\/|^\s*\*|info|Info|INFO/i)) {
    //   className = 'text-gray-400';
    // }

    const lineIsJson = line.startsWith("{") && line.endsWith("}");

    if (lineIsJson) {
      try {
        const parsedLine = JSON.parse(line);
        // console.log("Parsed line:", parsedLine);
        // console.log("Parsed line:", parsedLine.type);
        const keys = Object.keys(parsedLine);
        // console.log("Parsed line keys:", keys);

        if (parsedLine.type) {
          // console.log(parsedLine.type);
          switch (parsedLine.type) {
            case "message":
              // console.log("Parsed message:", parsedLine);
              const concatText = parsedLine.content
                .map((t: string) => t.text)
                .join(" ");
              className = "text-blue-300";
              content = concatText; // parsedLine.content;
              break;
            case "reasoning":
              className = "text-yellow-300";
              content = parsedLine.summary;
              break;
            case "function_call":
              className = "text-green-300";
              content = `${parsedLine.name}: ${parsedLine.arguments}`;
              break;
            case "function_call_output":
              className = "text-purple-300";
              // console.log("Parsed function call output:", parsedLine);
              content = parsedLine.output;
              break;
            default:
              console.warn("Unknown line type:", parsedLine.type);
              className = "text-gray-200"; // Default for unknown types
          }
        } else {
          console.warn("Line does not have a type:", parsedLine);
        }
        //
      } catch (e) {
        console.error("Failed to parse line as JSON:", e);
      }
    } else {
      // console.log("Line is not JSON:", line);
    }

    return (
      <div key={index} className={className}>
        {content}
      </div>
    );
  });
};

interface LogMessage {
  type: "connected" | "logs" | "status" | "finished" | "error";
  data?: string;
  status?: string;
  message?: string;
  timestamp?: string;
}

export function LogStream({ jobId, className = "" }: LogStreamProps) {
  const [logs, setLogs] = useState<string>("");
  const [status, setStatus] = useState<string>("pending");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-scroll to bottom when new logs arrive
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  useEffect(() => {
    if (!jobId) return;

    // Create EventSource for Server-Sent Events
    const eventSource = new EventSource(`/api/jobs/${jobId}/logs`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("Log stream connected");
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const message: LogMessage = JSON.parse(event.data);

        switch (message.type) {
          case "connected":
            console.log(
              "Connected to log stream for job:",
              message.jobId || jobId
            );
            break;

          case "logs":
            if (message.data) {
              setLogs((prev) => prev + message.data);
            }
            break;

          case "status":
            if (message.status) {
              setStatus(message.status);
            }
            break;

          case "finished":
            console.log("Job finished with status:", message.status);
            setStatus(message.status || "completed");
            setIsConnected(false);
            // Optionally trigger a page refresh after a short delay to show final results
            if (message.status === "completed") {
              setTimeout(() => {
                console.log(
                  "Job completed - refreshing page to show final results"
                );
                window.location.reload();
              }, 3000); // Wait 3 seconds before refresh
            }
            break;

          case "error":
            console.error("Log stream error:", message.message);
            setError(message.message || "Unknown error");
            break;
        }
      } catch (error) {
        console.error("Failed to parse log message:", error);
      }
    };

    eventSource.onerror = (event) => {
      console.error("EventSource error:", event);
      setError("Connection to log stream failed");
      setIsConnected(false);
    };

    // Cleanup on unmount
    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [jobId]);

  // Manual cleanup method
  const disconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Status Bar */}
      <div className="flex items-center justify-between border-b bg-gray-100 p-2">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-sm font-medium">
            Status:{" "}
            <span
              className={`${
                status === "completed"
                  ? "text-green-600"
                  : status === "failed"
                    ? "text-red-600"
                    : status === "running"
                      ? "text-blue-600"
                      : "text-gray-600"
              }`}
            >
              {status}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isConnected && <span className="text-xs text-gray-500">Live</span>}
          {isConnected && (
            <button
              onClick={disconnect}
              className="rounded bg-gray-200 px-2 py-1 text-xs hover:bg-gray-300"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      {/* Logs Display */}
      <div className="max-h-96 flex-1 overflow-auto bg-gray-900 p-4 font-mono text-sm">
        {logs ? (
          <div className="whitespace-pre-wrap">{parseTerminalOutput(logs)}</div>
        ) : (
          <div className="text-gray-500">Waiting for logs...</div>
        )}

        {/* Job completion indicator */}
        {!isConnected && status === "completed" && (
          <div className="mt-4 rounded border border-green-500/30 bg-green-900/20 p-2 text-center text-green-300">
            <i className="fas fa-check-circle mr-2"></i>
            Job completed successfully! Page will refresh shortly to show final
            results.
          </div>
        )}

        {!isConnected && status === "failed" && (
          <div className="mt-4 rounded border border-red-500/30 bg-red-900/20 p-2 text-center text-red-300">
            <i className="fas fa-times-circle mr-2"></i>
            Job failed. Check the logs above for error details.
          </div>
        )}

        <div ref={logsEndRef} />
      </div>

      {/* Footer */}
      <div className="border-t bg-gray-50 p-2 text-xs text-gray-500">
        Job ID: {jobId} | Logs: {logs.length} characters
      </div>
    </div>
  );
}
