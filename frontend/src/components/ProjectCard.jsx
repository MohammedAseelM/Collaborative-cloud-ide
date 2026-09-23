// src/components/ProjectCard.jsx
// Responsibility: Presentational card for a project. Includes overlays
// allowing routing to the workspace while keeping action buttons clickable.

import { Link } from "react-router-dom";
import { Pencil, Trash2, FolderCode, Star, Archive } from "lucide-react";

const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString();
};

const ProjectCard = ({ project, onEdit, onDelete, onFavorite, onArchive, currentUserId }) => {
  const currentUserKey = String(currentUserId || "");
  const isFavorite = project.favorites?.some(
    (favoriteUser) => String(favoriteUser?._id || favoriteUser) === currentUserKey
  );

  return (
    <div className="group relative overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-5 transition-all cursor-pointer min-w-0 hover:border-slate-700">
      {/* Overlay Link - absolute cover to navigate to project workspace page */}
      <Link
        to={`/project/${project._id}`}
        className="absolute inset-0 rounded-lg z-0"
        aria-label={`Open ${project.name} workspace`}
      />

      <div className="flex items-start justify-between gap-2 relative z-10 pointer-events-none">
        <div className="flex items-center gap-2 min-w-0">
          <FolderCode size={18} className="text-indigo-400 shrink-0" />
          <h3 className="text-slate-100 font-medium truncate">
            {project.name}
          </h3>
        </div>

        {/* Action buttons - hidden until the user hovers or focuses the project card */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavorite(project);
            }}
            className="p-1.5 rounded-md text-slate-400 transition-colors"
            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Star
              size={15}
              fill={isFavorite ? "currentColor" : "none"}
              className={isFavorite ? "text-amber-400" : "text-slate-400 hover:text-amber-400"}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchive(project);
            }}
            className="p-1.5 rounded-md text-slate-400 transition-colors"
            title={project.isArchived ? "Unarchive Project" : "Archive Project"}
          >
            <Archive
              size={15}
              className={project.isArchived ? "text-orange-400 hover:text-slate-400" : "text-slate-400 hover:text-orange-400"}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(project);
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
            aria-label={`Edit ${project.name}`}
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project);
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
            aria-label={`Delete ${project.name}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {project.description && (
        <p className="text-sm text-slate-400 mt-2 line-clamp-2 relative z-10 pointer-events-none">
          {project.description}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-4 pr-7 text-xs text-slate-500 relative z-10 pointer-events-none">
        <span className="capitalize px-2 py-0.5 rounded bg-slate-800 text-slate-300">
          {project.language}
        </span>
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className="truncate">Updated {formatRelativeTime(project.updatedAt)}</span>
        </div>
      </div>

      {isFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFavorite(project);
          }}
          className="absolute bottom-3 right-3 z-10 rounded p-1 text-amber-400 transition-colors hover:bg-amber-400/10"
          title="Remove from Favorites"
          aria-label={`Remove ${project.name} from Favorites`}
        >
          <Star size={12} fill="currentColor" />
        </button>
      )}
    </div>
  );
};

export default ProjectCard;
