import { FileDiff } from "~/types/job";

interface DiffViewerProps {
  files: FileDiff[];
}

interface FileHeaderProps {
  file: FileDiff;
}

const FileHeader = ({ file }: FileHeaderProps) => {
  const getStatusColor = (status: FileDiff["status"]) => {
    switch (status) {
      case "added":
        return "text-green-600";
      case "deleted":
        return "text-red-600";
      case "modified":
        return "text-blue-600";
      case "renamed":
        return "text-purple-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusIcon = (status: FileDiff["status"]) => {
    switch (status) {
      case "added":
        return <i className="fas fa-plus"></i>;
      case "deleted":
        return <i className="fas fa-minus"></i>;
      case "modified":
        return <i className="fas fa-edit"></i>;
      case "renamed":
        return <i className="fas fa-arrow-right"></i>;
      default:
        return <i className="fas fa-question"></i>;
    }
  };

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-600">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`font-mono text-sm ${getStatusColor(file.status)}`}>
            {getStatusIcon(file.status)}
          </span>
          <span className="font-mono text-sm">
            {file.oldFilename && file.status === "renamed"
              ? `${file.oldFilename} → ${file.filename}`
              : file.filename}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {file.additions > 0 && (
            <span className="text-green-600">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="text-red-600">−{file.deletions}</span>
          )}
        </div>
      </div>
    </div>
  );
};

// const DiffLines = ({ patch }: { patch: string }) => {
//   const lines = patch.split('\n');

//   return (
//     <div className="font-mono text-sm">
//       {lines.map((line, index) => {
//         let lineClass = 'px-4 py-0.5 ';
//         let lineNumberClass = 'text-gray-400 select-none pr-4 ';

//         if (line.startsWith('+')) {
//           lineClass += 'bg-green-50 text-green-800';
//         } else if (line.startsWith('-')) {
//           lineClass += 'bg-red-50 text-red-800';
//         } else if (line.startsWith('@@')) {
//           lineClass += 'bg-blue-50 text-blue-800 font-medium';
//         } else {
//           lineClass += 'text-gray-700';
//         }

//         return (
//           <div
//             key={index}
//             className={`flex ${lineClass} hover:bg-opacity-75`}
//           >
//             <span className={lineNumberClass}>
//               {index + 1}
//             </span>
//             <span className="flex-1 whitespace-pre-wrap break-all">
//               {line}
//             </span>
//           </div>
//         );
//       })}
//     </div>
//   );
// };

const DiffLines = ({ patch }: { patch: string }) => {
  const lines = patch.split("\n");

  return (
    <div className="font-mono text-sm">
      {lines.map((line, index) => {
        let lineClass = "px-4 py-0.5 ";
        let lineNumberClass =
          "text-gray-400 dark:text-gray-500 select-none pr-4 ";

        if (line.startsWith("+")) {
          lineClass +=
            "bg-green-50 text-green-800 dark:bg-green-900/40 dark:text-green-300";
        } else if (line.startsWith("-")) {
          lineClass +=
            "bg-red-50 text-red-800 dark:bg-red-900/40 dark:text-red-300";
        } else if (line.startsWith("@@")) {
          lineClass +=
            "bg-blue-50 text-blue-800 font-medium dark:bg-blue-900/40 dark:text-blue-300";
        } else {
          lineClass += "text-gray-700 dark:text-gray-300";
        }

        return (
          <div key={index} className={`flex ${lineClass} hover:bg-opacity-75`}>
            <span className={lineNumberClass}>{index + 1}</span>
            <span className="flex-1 whitespace-pre-wrap break-all">{line}</span>
          </div>
        );
      })}
    </div>
  );
};

export const DiffViewer = ({ files }: DiffViewerProps) => {
  if (files.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        <p>No changes to display</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {files.map((file, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600"
        >
          <FileHeader file={file} />
          <div className="max-h-[50vh] overflow-y-auto">
            <DiffLines patch={file.patch} />
          </div>
        </div>
      ))}
    </div>
  );
};
