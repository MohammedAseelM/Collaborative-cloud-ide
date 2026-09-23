// src/pages/AdminDashboard.jsx
// Responsibility: Platform governance dashboard for admins, displaying stats, user table searches, project indices, and raw Winston log rotation outputs.

import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import {
  Users,
  FolderOpen,
  Terminal,
  Activity,
  Trash2,
  Search,
  RefreshCw,
  Cpu,
  HardDrive,
  Clock,
  Settings,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import {
  fetchAdminStats,
  fetchAdminUsers,
  fetchAdminProjects,
  adminDeleteUserRequest,
  adminDeleteProjectRequest,
  fetchAdminLogs,
} from "../services/admin.service";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

const AdminDashboard = () => {
  const { user } = useAuth();
  const { addToast } = useToast();

  // Authentication check - admin only
  if (!user || user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  const [activeTab, setActiveTab] = useState("stats"); // "stats" | "users" | "projects" | "logs"

  // Aggregate stats states
  const [stats, setStats] = useState(null);
  const [sysInfo, setSysInfo] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Users management states
  const [usersList, setUsersList] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Projects governance states
  const [projectsList, setProjectsList] = useState([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPage, setProjectPage] = useState(1);
  const [projectTotalPages, setProjectTotalPages] = useState(1);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Logs stream states
  const [rawLogs, setRawLogs] = useState("");
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // 1. Fetch system statistics
  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const data = await fetchAdminStats();
      setStats(data.stats);
      setSysInfo(data.systemInfo);
    } catch (err) {
      addToast("Failed to retrieve system metrics", "error");
    } finally {
      setIsLoadingStats(false);
    }
  };

  // 2. Fetch users list
  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const data = await fetchAdminUsers(userSearch, userPage, 8);
      setUsersList(data.users || []);
      setUserTotalPages(data.totalPages || 1);
    } catch (err) {
      addToast("Failed to fetch user accounts", "error");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // 3. Fetch projects list
  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const data = await fetchAdminProjects(projectSearch, projectPage, 8);
      setProjectsList(data.projects || []);
      setProjectTotalPages(data.totalPages || 1);
    } catch (err) {
      addToast("Failed to fetch project listings", "error");
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // 4. Fetch daily combined logs
  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await fetchAdminLogs();
      setRawLogs(data.logs || "No logs recorded today.");
    } catch (err) {
      addToast("Failed to fetch system logs", "error");
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Trigger loads based on active tabs
  useEffect(() => {
    if (activeTab === "stats") loadStats();
    if (activeTab === "users") loadUsers();
    if (activeTab === "projects") loadProjects();
    if (activeTab === "logs") loadLogs();
  }, [activeTab, userPage, projectPage]);

  // Handle Search submissions
  const handleUserSearchSubmit = (e) => {
    e.preventDefault();
    setUserPage(1);
    loadUsers();
  };

  const handleProjectSearchSubmit = (e) => {
    e.preventDefault();
    setProjectPage(1);
    loadProjects();
  };

  // Delete User handler
  const handleDeleteUser = async (userId, userName) => {
    const confirm = window.confirm(
      `Are you sure you want to force-delete the user "${userName}"? This will cascadingly destroy all their projects, directories, and snapshot versions.`
    );
    if (!confirm) return;

    try {
      await adminDeleteUserRequest(userId);
      addToast(`User ${userName} deleted successfully`, "success");
      loadUsers();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to delete user", "error");
    }
  };

  // Delete Project handler
  const handleDeleteProject = async (projectId, projectName) => {
    const confirm = window.confirm(
      `Are you sure you want to force-delete the project "${projectName}"? This destroys files and snapshot indices permanently.`
    );
    if (!confirm) return;

    try {
      await adminDeleteProjectRequest(projectId);
      addToast(`Project "${projectName}" deleted successfully`, "success");
      loadProjects();
    } catch (err) {
      addToast("Failed to delete project", "error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header Navbar */}
      <header className="h-14 border-b border-slate-900 bg-slate-950 px-4 md:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="p-1.5 rounded hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-indigo-400" size={18} />
            <h1 className="text-sm font-semibold text-slate-100">Admin Governance Portal</h1>
          </div>
        </div>

        {activeTab === "stats" && (
          <button
            onClick={loadStats}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors text-slate-300 cursor-pointer"
          >
            <RefreshCw size={13} className={isLoadingStats ? "animate-spin" : ""} />
            <span>Refresh Diagnostics</span>
          </button>
        )}
      </header>

      {/* Workspace Frame */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 flex flex-col md:flex-row gap-6 min-h-0">
        {/* Navigation panel */}
        <aside className="w-full md:w-56 flex md:flex-col gap-1 shrink-0 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveTab("stats")}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "stats"
                ? "bg-slate-900 text-indigo-400 border border-slate-800"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <Activity size={15} />
            <span>Diagnostic Metrics</span>
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "users"
                ? "bg-slate-900 text-indigo-400 border border-slate-800"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <Users size={15} />
            <span>Manage User Directory</span>
          </button>
          <button
            onClick={() => setActiveTab("projects")}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "projects"
                ? "bg-slate-900 text-indigo-400 border border-slate-800"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <FolderOpen size={15} />
            <span>Project Index</span>
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "logs"
                ? "bg-slate-900 text-indigo-400 border border-slate-800"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <Terminal size={15} />
            <span>Winston Logs Stream</span>
          </button>
        </aside>

        {/* Content Box */}
        <main className="flex-1 bg-slate-900/20 border border-slate-900 rounded-xl p-6 min-h-0 overflow-y-auto">
          {/* Tab 1: Diagnostic Metrics */}
          {activeTab === "stats" && (
            <div className="space-y-6">
              {/* Counter Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex flex-col gap-1">
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Total Users</span>
                    <Users size={16} />
                  </div>
                  {isLoadingStats ? (
                    <div className="h-7 w-12 bg-slate-900 rounded animate-pulse mt-1" />
                  ) : (
                    <span className="text-xl font-bold text-slate-100">{stats?.totalUsers || 0}</span>
                  )}
                </div>

                <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex flex-col gap-1">
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Projects</span>
                    <FolderOpen size={16} />
                  </div>
                  {isLoadingStats ? (
                    <div className="h-7 w-12 bg-slate-900 rounded animate-pulse mt-1" />
                  ) : (
                    <span className="text-xl font-bold text-slate-100">{stats?.totalProjects || 0}</span>
                  )}
                </div>

                <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex flex-col gap-1">
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Files Node</span>
                    <Settings size={16} />
                  </div>
                  {isLoadingStats ? (
                    <div className="h-7 w-12 bg-slate-900 rounded animate-pulse mt-1" />
                  ) : (
                    <span className="text-xl font-bold text-slate-100">{stats?.totalFiles || 0}</span>
                  )}
                </div>

                <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex flex-col gap-1">
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Sandbox Runs</span>
                    <Terminal size={16} />
                  </div>
                  {isLoadingStats ? (
                    <div className="h-7 w-12 bg-slate-900 rounded animate-pulse mt-1" />
                  ) : (
                    <span className="text-xl font-bold text-slate-100">{stats?.totalCodeRuns || 0}</span>
                  )}
                </div>
              </div>

              {/* System Details */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">System Specifications</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-950/40 border border-slate-900/60 p-4 rounded-lg flex items-center gap-3.5">
                    <Cpu className="text-indigo-400 shrink-0" size={20} />
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Processors</span>
                      <span className="text-xs text-slate-200 block truncate font-medium">
                        {sysInfo?.cpuCount || 0} Core CPU ({sysInfo?.arch || "x64"})
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-900/60 p-4 rounded-lg flex items-center gap-3.5">
                    <HardDrive className="text-indigo-400 shrink-0" size={20} />
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Server Memory</span>
                      <span className="text-xs text-slate-200 block truncate font-medium">
                        {sysInfo?.freeMem || "0 GB"} free / {sysInfo?.totalMem || "0 GB"} total
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-900/60 p-4 rounded-lg flex items-center gap-3.5">
                    <Clock className="text-indigo-400 shrink-0" size={20} />
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Host Uptime</span>
                      <span className="text-xs text-slate-200 block truncate font-medium">
                        {sysInfo?.uptime || "0 hours"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Node.js Diagnostics */}
              <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/40 space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Node.js Process Parameters</h3>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div className="flex justify-between py-1.5 border-b border-slate-900/60">
                    <span className="text-slate-500">Node Engine Version:</span>
                    <span className="text-slate-300 font-semibold">{sysInfo?.nodeVersion || "Unknown"}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-900/60">
                    <span className="text-slate-500">Server Platform OS:</span>
                    <span className="text-slate-300 font-semibold uppercase">{sysInfo?.platform || "Unknown"}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Node Heap Memory Alloc:</span>
                    <span className="text-indigo-400 font-semibold">{sysInfo?.memoryUsage || "0 MB"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: User Directory */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center gap-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Registered Developers</h3>
                <form onSubmit={handleUserSearchSubmit} className="flex gap-2 max-w-xs w-full relative">
                  <input
                    type="text"
                    placeholder="Search name or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                  />
                  <Search className="absolute left-2.5 top-2.5 text-slate-600" size={13} />
                </form>
              </div>

              {isLoadingUsers ? (
                <div className="space-y-2 py-8 flex flex-col items-center justify-center text-slate-500">
                  <Loader2 className="animate-spin text-indigo-500" size={24} />
                  <span className="text-xs">Loading user list...</span>
                </div>
              ) : usersList.length === 0 ? (
                <div className="py-12 border border-dashed border-slate-800 rounded-lg text-center text-slate-600 text-xs">
                  No users found matching query.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto border border-slate-900 rounded-lg bg-slate-950/40">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-900 bg-slate-950 text-slate-500 font-medium">
                          <th className="p-3">User Profile</th>
                          <th className="p-3">Email Address</th>
                          <th className="p-3">Role</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {usersList.map((usr) => (
                          <tr key={usr._id} className="hover:bg-slate-900/10">
                            <td className="p-3 font-medium text-slate-200">{usr.name}</td>
                            <td className="p-3 text-slate-400 font-mono">{usr.email}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  usr.role === "admin"
                                    ? "bg-red-950/40 border border-red-900/30 text-red-400"
                                    : "bg-indigo-950/40 border border-indigo-900/30 text-indigo-400"
                                }`}
                              >
                                {usr.role}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleDeleteUser(usr._id, usr.name)}
                                disabled={usr.role === "admin"}
                                className="p-1.5 rounded hover:bg-red-950/30 border border-transparent hover:border-red-900/30 text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                title="Force delete account"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex justify-between items-center text-xs text-slate-500 px-1 select-none">
                    <span>Page {userPage} of {userTotalPages}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                        disabled={userPage === 1}
                        className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 text-slate-300 font-semibold cursor-pointer disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                        disabled={userPage === userTotalPages}
                        className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 text-slate-300 font-semibold cursor-pointer disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Project Governance */}
          {activeTab === "projects" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center gap-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Workspace Projects</h3>
                <form onSubmit={handleProjectSearchSubmit} className="flex gap-2 max-w-xs w-full relative">
                  <input
                    type="text"
                    placeholder="Search project name..."
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                  />
                  <Search className="absolute left-2.5 top-2.5 text-slate-600" size={13} />
                </form>
              </div>

              {isLoadingProjects ? (
                <div className="space-y-2 py-8 flex flex-col items-center justify-center text-slate-500">
                  <Loader2 className="animate-spin text-indigo-500" size={24} />
                  <span className="text-xs">Loading projects list...</span>
                </div>
              ) : projectsList.length === 0 ? (
                <div className="py-12 border border-dashed border-slate-800 rounded-lg text-center text-slate-600 text-xs">
                  No projects found matching query.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto border border-slate-900 rounded-lg bg-slate-950/40">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-900 bg-slate-950 text-slate-500 font-medium">
                          <th className="p-3">Project Title</th>
                          <th className="p-3">Language</th>
                          <th className="p-3">Owner Profile</th>
                          <th className="p-3">Members Count</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {projectsList.map((proj) => (
                          <tr key={proj._id} className="hover:bg-slate-900/10">
                            <td className="p-3 font-medium text-slate-200 flex flex-col gap-0.5">
                              <span>{proj.name}</span>
                              <span className="text-[10px] text-slate-500 line-clamp-1 italic font-normal">
                                {proj.description || "No description provided"}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="text-slate-300 font-mono capitalize">{proj.language}</span>
                            </td>
                            <td className="p-3 text-slate-400">
                              {proj.owner ? (
                                <span title={proj.owner.email}>{proj.owner.name}</span>
                              ) : (
                                <span className="italic text-slate-600">Unknown</span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-slate-400">{proj.members?.length || 1}</td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleDeleteProject(proj._id, proj.name)}
                                className="p-1.5 rounded hover:bg-red-950/30 border border-transparent hover:border-red-900/30 text-red-400 hover:text-red-300 cursor-pointer"
                                title="Force delete project"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex justify-between items-center text-xs text-slate-500 px-1 select-none">
                    <span>Page {projectPage} of {projectTotalPages}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setProjectPage((p) => Math.max(1, p - 1))}
                        disabled={projectPage === 1}
                        className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 text-slate-300 font-semibold cursor-pointer disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setProjectPage((p) => Math.min(projectTotalPages, p + 1))}
                        disabled={projectPage === projectTotalPages}
                        className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 hover:bg-slate-800 text-slate-300 font-semibold cursor-pointer disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Winston Logs Stream */}
          {activeTab === "logs" && (
            <div className="space-y-4 flex flex-col h-full min-h-[400px]">
              <div className="flex justify-between items-center gap-4 shrink-0">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Terminal size={15} />
                    <span>Raw Combined Logs Rotation</span>
                  </h3>
                  <span className="text-[10px] text-slate-500 block">Displays the last 200 operational Winston API logs.</span>
                </div>
                <button
                  onClick={loadLogs}
                  disabled={isLoadingLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors text-slate-300 cursor-pointer"
                >
                  <RefreshCw size={13} className={isLoadingLogs ? "animate-spin" : ""} />
                  <span>Sync Output</span>
                </button>
              </div>

              <div className="flex-1 bg-slate-950 border border-slate-900 rounded-lg p-4 font-mono text-[11px] text-slate-300 overflow-y-auto leading-relaxed max-h-96 select-text">
                {isLoadingLogs ? (
                  <div className="h-full flex items-center justify-center text-slate-600 gap-2">
                    <Loader2 className="animate-spin text-indigo-500" size={16} />
                    <span>Reading logs filesystem...</span>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap">{rawLogs}</pre>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

// Internal Lucide icon wrapper since ShieldAlert wasn't in main import
const ShieldAlert = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size || "24"}
    height={props.size || "24"}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export default AdminDashboard;
