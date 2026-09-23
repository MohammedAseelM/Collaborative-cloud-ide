// src/components/ProjectModal.jsx
// Responsibility: Reusable modal form used for both "create project"
// and "edit project name" flows, toggled via the `mode` prop. Keeping
// one component for both avoids duplicating the form/markup.

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * @param {"create" | "edit"} mode
 * @param {object} [initialProject] - required when mode="edit"
 * @param {(values: { name: string, description?: string }) => Promise<void>} onSubmit
 * @param {() => void} onClose
 */
const ProjectModal = ({ mode, initialProject, onSubmit, onClose }) => {
  const [name, setName] = useState(initialProject?.name || "");
  const [description, setDescription] = useState(
    initialProject?.description || ""
  );
  const [language, setLanguage] = useState(
    initialProject?.language || "javascript"
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close on Escape key for better keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Project name must be at least 2 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim(), language });
      onClose();
    } catch (err) {
      const responseData = err.response?.data;
      setError(
        responseData?.errors?.[0]?.message ||
          responseData?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">
            {mode === "create" ? "Create New Project" : "Edit Project"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="project-name"
              className="block text-sm text-slate-300 mb-1"
            >
              Project name
            </label>
            <input
              id="project-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="My Awesome Project"
            />
          </div>

          {mode === "create" && (
            <div>
              <label
                htmlFor="project-description"
                className="block text-sm text-slate-300 mb-1"
              >
                Description{" "}
                <span className="text-slate-500">(optional)</span>
              </label>
              <textarea
                id="project-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="What's this project about?"
              />
            </div>
          )}

          {mode === "create" && (
            <div>
              <label
                htmlFor="project-language"
                className="block text-sm text-slate-300 mb-1"
              >
                Primary Language
              </label>
              <select
                id="project-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-xs"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="c">C</option>
                <option value="cpp">C++</option>
                <option value="typescript">TypeScript</option>
                <option value="react">React</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {isSubmitting
                ? "Saving..."
                : mode === "create"
                ? "Create Project"
                : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectModal;
