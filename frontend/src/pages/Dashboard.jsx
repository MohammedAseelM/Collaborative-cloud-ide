import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderCode, FolderUp, Sparkles } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import ProjectCard from "../components/ProjectCard";
import ProjectModal from "../components/ProjectModal";
import ImportProjectModal from "../components/ImportProjectModal";
import CreateReactModal from "../components/CreateReactModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useProjects } from "../hooks/useProjects";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { DashboardSkeleton } from "../components/Skeletons";
import InvitationsInbox from "../components/InvitationsInbox";

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [modalState, setModalState] = useState(null); // { mode: "create" | "edit", project? }
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCreateReactOpen, setIsCreateReactOpen] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const { addToast } = useToast();

  const {
    projects,
    searchTerm,
    setSearchTerm,
    isLoading,
    error,
    currentPage,
    setCurrentPage,
    totalPages,
    favoriteFilter,
    setFavoriteFilter,
    archivedFilter,
    setArchivedFilter,
    sortBy,
    setSortBy,
    createProject,
    renameProject,
    deleteProject,
    toggleFavorite,
    toggleArchive,
    refresh,
  } = useProjects();

  const handleCreateSubmit = async (values) => {
    try {
      await createProject(values);
      addToast("Project created successfully!", "success");
      setModalState(null);
    } catch (err) {
      addToast(
        err.response?.data?.message || "Failed to create project. Try again.",
        "error"
      );
    }
  };

  const handleEditSubmit = async (values) => {
    try {
      await renameProject(modalState.project._id, values.name);
      addToast("Project updated successfully!", "success");
      setModalState(null);
    } catch (err) {
      addToast(
        err.response?.data?.message || "Failed to update project. Try again.",
        "error"
      );
    }
  };

  const handleConfirmDelete = async () => {
    setDeleteError("");
    try {
      await deleteProject(projectPendingDelete._id);
      addToast("Project deleted successfully!", "success");
      setProjectPendingDelete(null);
    } catch (err) {
      const errMsg = err.response?.data?.message || "Failed to delete project. Try again.";
      setDeleteError(errMsg);
      addToast(errMsg, "error");
    }
  };

  return (
    <div className="h-screen flex bg-slate-950">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          onMenuClick={() => setIsSidebarOpen(true)}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
          {/* Inbox for Collaboration Invitations */}
          <InvitationsInbox onAcceptSuccess={refresh} />

          {isLoading ? (
            <DashboardSkeleton />
          ) : (
            <>
              {/* Header Grid with Search, Filters and Sorting */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-900 pb-4">
                <div>
                  <h1 className="text-xl md:text-2xl font-semibold text-slate-100">
                    Recent Projects
                  </h1>
                  <p className="text-sm text-slate-400 mt-1">
                    {searchTerm
                      ? `Results for "${searchTerm}"`
                      : "Manage your collaborative code workspaces"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Favorite/Archived filters tabs */}
                  <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-xs">
                    <button
                      onClick={() => {
                        setFavoriteFilter(false);
                        setArchivedFilter(false);
                      }}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                        !favoriteFilter && !archivedFilter
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => {
                        setFavoriteFilter(true);
                        setArchivedFilter(false);
                      }}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                        favoriteFilter
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Favorites
                    </button>
                    <button
                      onClick={() => {
                        setFavoriteFilter(false);
                        setArchivedFilter(true);
                      }}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                        archivedFilter
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Archived
                    </button>
                  </div>

                  {/* Sort dropdown option */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="rounded-md border border-slate-850 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer hover:border-slate-700 transition-colors"
                  >
                    <option value="updatedAt">Last Updated</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="createdAt">Created Date</option>
                  </select>

                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center gap-2 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-cyan-400 text-xs font-semibold px-3.5 py-2 transition-colors shrink-0 cursor-pointer"
                  >
                    <FolderUp size={14} />
                    <span>Import Project</span>
                  </button>

                  <button
                    onClick={() => setIsCreateReactOpen(true)}
                    className="flex items-center gap-2 rounded-md bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold px-3.5 py-2 transition-all shadow-md shadow-indigo-500/10 shrink-0 cursor-pointer"
                  >
                    <Sparkles size={14} />
                    <span>+ Create React Project</span>
                  </button>

                  <button
                    onClick={() => setModalState({ mode: "create" })}
                    className="flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 transition-colors shrink-0 cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>New Project</span>
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-md px-4 py-3">
                  {error}
                </p>
              )}

              {projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-20 border border-dashed border-slate-800 rounded-lg">
                  <FolderCode size={36} className="text-slate-600 mb-3" />
                  <p className="text-slate-300 font-medium">
                    {searchTerm ? "No projects match your search" : "No projects yet"}
                  </p>
                  <p className="text-sm text-slate-500 mt-1 mb-4">
                    {searchTerm
                      ? "Try a different search term"
                      : "Create your first project or import an existing workspace from your computer"}
                  </p>
                  {!searchTerm && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="flex items-center gap-2 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-400 text-sm font-medium px-4 py-2 transition-colors cursor-pointer"
                      >
                        <FolderUp size={16} />
                        Import Project
                      </button>
                      <button
                        onClick={() => setIsCreateReactOpen(true)}
                        className="flex items-center gap-2 rounded-md bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-sm font-medium px-4 py-2 transition-all cursor-pointer shadow-md shadow-indigo-500/20"
                      >
                        <Sparkles size={16} />
                        + Create React Project
                      </button>
                      <button
                        onClick={() => setModalState({ mode: "create" })}
                        className="flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 transition-colors cursor-pointer"
                      >
                        <Plus size={16} />
                        New Project
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projects.map((project) => (
                      <ProjectCard
                        key={project._id}
                        project={project}
                        currentUserId={user?._id || user?.id}
                        onEdit={(p) => setModalState({ mode: "edit", project: p })}
                        onDelete={(p) => setProjectPendingDelete(p)}
                        onFavorite={(p) => toggleFavorite(p._id)}
                        onArchive={(p) => toggleArchive(p._id)}
                      />
                    ))}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mt-8 select-none">
                      <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((prev) => prev - 1)}
                        className="px-4 py-2 text-sm font-medium bg-slate-900 border border-slate-800 text-slate-300 rounded hover:bg-slate-800 disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-slate-400 font-mono">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((prev) => prev + 1)}
                        className="px-4 py-2 text-sm font-medium bg-slate-900 border border-slate-800 text-slate-300 rounded hover:bg-slate-850 disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {modalState && (
        <ProjectModal
          mode={modalState.mode}
          initialProject={modalState.project}
          onSubmit={
            modalState.mode === "create" ? handleCreateSubmit : handleEditSubmit
          }
          onClose={() => setModalState(null)}
        />
      )}

      <ImportProjectModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      <CreateReactModal
        isOpen={isCreateReactOpen}
        onClose={() => setIsCreateReactOpen(false)}
        onCreateSuccess={(newProject) => {
          refresh();
          if (newProject?._id) {
            navigate(`/workspace/${newProject._id}`);
          }
        }}
      />

      {projectPendingDelete && (
        <ConfirmDialog
          title="Delete project?"
          message={`"${projectPendingDelete.name}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setProjectPendingDelete(null);
            setDeleteError("");
          }}
        />
      )}

      {deleteError && (
        <div className="fixed bottom-4 right-4 bg-red-950 border border-red-900 text-red-300 text-sm rounded-md px-4 py-3 z-50 animate-slide-in">
          {deleteError}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
