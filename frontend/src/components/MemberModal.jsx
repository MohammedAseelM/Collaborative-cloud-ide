// frontend/src/components/MemberModal.jsx
// Responsibility: Redesigned GitHub/Notion/VS Code style Team & Collaborators Management Modal.
// Features: Centered header, Invite Member modal, role assignment, online counters,
// pending invitation management (resend/cancel), snapshot versions, and vertical activity timeline.

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Crown,
  History,
  Loader2,
  Mail,
  MoreVertical,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
  Eye,
  FileCode,
  Sparkles,
  GitBranch,
  CheckSquare,
  Calendar,
  ListTodo,
} from "lucide-react";
import {
  fetchMembers,
  fetchVersions,
  removeMemberRequest,
  saveVersionRequest,
  updateMemberRoleRequest,
  fetchActivities,
} from "../services/project.service";
import {
  cancelInvitationRequest,
  createInvitationRequest,
  fetchProjectInvitations,
  resendInvitationRequest,
} from "../services/invitation.service";
import {
  fetchProjectTasks,
  createProjectTask,
  updateTaskStatusRequest,
  deleteProjectTaskRequest,
} from "../services/task.service";
import { useToast } from "../context/ToastContext";

const ROLE_STYLES = {
  Owner: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Admin: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  Editor: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  Viewer: "border-slate-700 bg-slate-800/60 text-slate-300",
  Client: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
};

const PRIORITY_STYLES = {
  Low: "border-slate-700 bg-slate-800/80 text-slate-300",
  Medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  High: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

const STATUS_STYLES = {
  Pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  "In Progress": "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  Completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Blocked: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

const getAvatarColor = (name = "") => {
  const colors = [
    "bg-indigo-600",
    "bg-purple-600",
    "bg-emerald-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-cyan-600",
    "bg-blue-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const describeActivity = (activity) => {
  const details = activity.details || {};
  const descriptions = {
    CREATE: `Created project "${details.name || ""}"`,
    JOIN: "Joined the workspace team",
    LEAVE: "Left the workspace team",
    ADD_MEMBER: `Invited collaborator ${details.memberName || ""}`,
    REMOVE_MEMBER: `Removed collaborator ${details.memberName || ""}`,
    SAVE_VERSION: `Saved snapshot version v${details.versionNumber || ""}`,
    RESTORE_VERSION: `Restored version v${details.versionNumber || ""}`,
    RUN: `Executed code sandbox run (${details.language || "project"})`,
  };
  if (activity.type === "EDIT") {
    if (details.action === "change_role")
      return `Updated ${details.memberName || "member"} role to ${details.role}`;
    return `${
      details.action === "create"
        ? "Created"
        : details.action === "rename"
        ? "Renamed"
        : "Updated"
    } ${details.type || "file"} "${details.name || details.newName || ""}"`;
  }
  return descriptions[activity.type] || "Updated workspace project";
};

export default function MemberModal({
  isOpen,
  onClose,
  projectId,
  userRole,
  currentUserId,
  onlineUsers = [],
  onBeforeSaveVersion,
  onRestoreVersion,
  onOpenDiff,
}) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState("team"); // "team" | "versions" | "timeline"
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  // Data states
  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [versions, setVersions] = useState([]);
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);

  // Task Form states
  const [isAssignTaskOpen, setIsAssignTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    assignedTo: "",
    priority: "Medium",
    dueDate: "",
  });
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // Invite Form states
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Editor");
  const [inviteMessage, setInviteMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  // Version form states
  const [versionNote, setVersionNote] = useState("");

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendingInviteId, setResendingInviteId] = useState(null);

  const currentMember = members.find(
    (member) =>
      member._id?.toString() === currentUserId?.toString() ||
      member.id?.toString() === currentUserId?.toString()
  );
  const effectiveUserRole = currentMember?.role || userRole;
  const isOwner =
    userRole === "Owner" ||
    effectiveUserRole === "Owner" ||
    (currentMember && currentMember.role === "Owner");
  const isOwnerOrAdmin =
    isOwner ||
    userRole === "Admin" ||
    effectiveUserRole === "Admin" ||
    (currentMember && currentMember.role === "Admin");
  const isReadOnly = effectiveUserRole === "Viewer" || effectiveUserRole === "Client";

  // Fetch members & pending invitations
  const loadTeam = useCallback(async () => {
    setIsLoading(true);
    try {
      const membersData = await fetchMembers(projectId);
      setMembers(membersData.members || []);

      if (isOwnerOrAdmin) {
        const inviteData = await fetchProjectInvitations(projectId);
        setPendingInvites(inviteData.invitations || []);
      }
    } catch (error) {
      addToast(error.response?.data?.message || "Failed to load collaborators", "error");
    } finally {
      setIsLoading(false);
    }
  }, [addToast, isOwnerOrAdmin, projectId]);

  // Fetch version snapshots
  const loadVersions = useCallback(async () => {
    try {
      const data = await fetchVersions(projectId);
      setVersions(data.versions || []);
    } catch {
      addToast("Failed to load version history", "error");
    }
  }, [addToast, projectId]);

  // Fetch activities history
  const loadActivities = useCallback(async () => {
    try {
      const data = await fetchActivities(projectId);
      setActivities(data.activities || []);
    } catch {
      addToast("Failed to load activity history", "error");
    }
  }, [addToast, projectId]);

  // Fetch project tasks
  const loadTasks = useCallback(async () => {
    setIsLoadingTasks(true);
    try {
      const data = await fetchProjectTasks(projectId);
      setTasks(data.tasks || []);
    } catch {
      // Silently catch error
    } finally {
      setIsLoadingTasks(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) return;
    loadTeam();
    loadVersions();
    loadActivities();
    loadTasks();
  }, [isOpen, loadActivities, loadTeam, loadVersions, loadTasks]);

  // Validate Email Address
  const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return "Email address is required";
    if (!regex.test(email)) return "Please enter a valid email address";
    return "";
  };

  // Submit Invite Member Form
  const handleSendInvite = async (e) => {
    e.preventDefault();
    const errorMsg = validateEmail(inviteEmail.trim());
    if (errorMsg) {
      setEmailError(errorMsg);
      return;
    }
    setEmailError("");
    setIsSubmitting(true);

    try {
      await createInvitationRequest(projectId, {
        email: inviteEmail.trim(),
        role: inviteRole,
        message: inviteMessage.trim(),
      });
      addToast(`Invitation sent to ${inviteEmail.trim()}`, "success");
      setInviteEmail("");
      setInviteRole("Editor");
      setInviteMessage("");
      setIsInviteDialogOpen(false);
      loadTeam();
      loadActivities();
    } catch (error) {
      addToast(error.response?.data?.message || "Failed to send invitation", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resend Pending Invitation
  const handleResendInvite = async (inviteId, targetEmail) => {
    setResendingInviteId(inviteId);
    try {
      await resendInvitationRequest(inviteId);
      addToast(`Invitation resent to ${targetEmail}`, "success");
      loadTeam();
    } catch (error) {
      addToast(error.response?.data?.message || "Failed to resend invitation", "error");
    } finally {
      setResendingInviteId(null);
    }
  };

  // Cancel Pending Invitation
  const handleCancelInvite = async (inviteId) => {
    if (!window.confirm("Are you sure you want to cancel this invitation?")) return;
    try {
      await cancelInvitationRequest(inviteId);
      addToast("Invitation cancelled", "info");
      loadTeam();
    } catch {
      addToast("Failed to cancel invitation", "error");
    }
  };

  // Change Collaborator Role
  const handleChangeRole = async (memberId, nextRole) => {
    try {
      await updateMemberRoleRequest(projectId, memberId, nextRole);
      addToast("Member role updated", "success");
      loadTeam();
      loadActivities();
    } catch (error) {
      addToast(error.response?.data?.message || "Failed to update member role", "error");
    }
  };

  // Remove Collaborator (Kick or Leave)
  const handleRemoveMember = async (member) => {
    const isSelf = member._id === currentUserId;
    const confirmMessage = isSelf
      ? "Are you sure you want to leave this project workspace?"
      : `Are you sure you want to remove ${member.name} from this project?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await removeMemberRequest(projectId, member._id);
      addToast(isSelf ? "You left the project" : `${member.name} was removed`, "success");
      if (isSelf) {
        window.location.href = "/dashboard";
      } else {
        loadTeam();
      }
    } catch (error) {
      addToast(error.response?.data?.message || "Failed to remove member", "error");
    }
  };

  // Save Version Snapshot
  const handleSaveVersion = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onBeforeSaveVersion?.();
      await saveVersionRequest(projectId, versionNote.trim());
      setVersionNote("");
      addToast("Version snapshot saved!", "success");
      loadVersions();
      loadActivities();
    } catch (error) {
      addToast(error.response?.data?.message || "Failed to save snapshot", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Restore Version Snapshot
  const handleRestoreVersion = async (version) => {
    if (
      !window.confirm(
        `Restore version v${version.versionNumber}? Workspace files will be reverted.`
      )
    )
      return;
    try {
      await onRestoreVersion?.(version);
      loadVersions();
      loadActivities();
    } catch {
      // Handled by workspace
    }
  };

  // Task Handlers (Owner & Admin task assignment)
  const handleOpenAssignTask = (targetMember = null) => {
    const defaultMemberId = targetMember?._id || members[0]?._id || "";
    setTaskForm({
      title: "",
      description: "",
      assignedTo: defaultMemberId,
      priority: "Medium",
      dueDate: "",
    });
    setIsAssignTaskOpen(true);
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) {
      addToast("Task title is required", "error");
      return;
    }
    if (!taskForm.assignedTo) {
      addToast("Please select a member to assign the task to", "error");
      return;
    }

    setIsSubmittingTask(true);
    try {
      await createProjectTask(projectId, {
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        assignedTo: taskForm.assignedTo,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate || undefined,
      });
      addToast("Task assigned successfully!", "success");
      setIsAssignTaskOpen(false);
      setTaskForm({
        title: "",
        description: "",
        assignedTo: "",
        priority: "Medium",
        dueDate: "",
      });
      loadTasks();
    } catch (error) {
      addToast(error.response?.data?.message || "Failed to assign task", "error");
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleStatusChange = async (taskId, nextStatus) => {
    try {
      await updateTaskStatusRequest(projectId, taskId, nextStatus);
      addToast(`Task marked as ${nextStatus}`, "success");
      loadTasks();
    } catch (error) {
      addToast(error.response?.data?.message || "Failed to update task status", "error");
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      await deleteProjectTaskRequest(projectId, taskId);
      addToast("Task deleted", "info");
      loadTasks();
    } catch (error) {
      addToast(error.response?.data?.message || "Failed to delete task", "error");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none">
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity cursor-pointer"
      />

      {/* Main Modal Card */}
      <div className="relative z-10 flex flex-col w-full max-w-4xl max-h-[90vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl shadow-indigo-950/40 overflow-hidden text-slate-100 animate-in fade-in zoom-in duration-200">
        
        {/* Header Section (Centered & Properly Aligned) */}
        <header className="relative px-6 py-5 border-b border-slate-900 bg-slate-950 text-center shrink-0">
          {/* Top-Right Action Buttons (Invite + Assign Task + Close X) */}
          <div className="absolute top-4 right-5 flex items-center space-x-2.5">
            {isOwnerOrAdmin && (
              <>
                <button
                  onClick={() => handleOpenAssignTask()}
                  className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 rounded-xl transition-all cursor-pointer"
                  title="Assign task to collaborator"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                  <span>+ Assign Task</span>
                </button>
                <button
                  onClick={() => setIsInviteDialogOpen(true)}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/30 transition-all transform hover:scale-[1.02] cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Invite Member</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-900 rounded-xl transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col items-center max-w-xl mx-auto pr-24 sm:pr-0">
            <h2 className="text-xl font-bold tracking-tight text-slate-100">
              Project Collaborators
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Manage your project members, roles, invitations, version history, and activity timeline.
            </p>
          </div>
        </header>

        {/* Counter Stats Header Bar */}
        <div className="flex items-center justify-around px-6 py-2.5 bg-slate-900/60 border-b border-slate-900 text-xs font-medium text-slate-400 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 font-semibold">
              🟢 Online: {onlineUsers.length}
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>👥 Total Members: {members.length}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Mail className="w-3.5 h-3.5 text-amber-400" />
            <span>📩 Pending Invitations: {pendingInvites.length}</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex border-b border-slate-900 px-6 bg-slate-950 shrink-0">
          {[
            ["team", "Team", Users, members.length],
            ["tasks", "Tasks", CheckSquare, tasks.length],
            ["versions", "Versions", History, versions.length],
            ["timeline", "Timeline", Activity, activities.length],
          ].map(([id, label, Icon, count]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center space-x-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === id
                  ? "border-indigo-500 text-indigo-300 bg-slate-900/40"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-slate-800 text-slate-300">
                {count}
              </span>
            </button>
          ))}
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 min-h-0 bg-slate-950">
          {/* 1. TEAM TAB */}
          {activeTab === "team" && (
            <div className="space-y-6">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                </div>
              ) : members.length === 0 ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                  <div className="p-4 rounded-full bg-slate-900 text-slate-400 mb-3">
                    <Users className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-semibold text-slate-200">
                    👥 No team members yet.
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Invite collaborators to work together in real time with Monaco Editor and live preview.
                  </p>
                  {isOwnerOrAdmin && (
                    <button
                      onClick={() => setIsInviteDialogOpen(true)}
                      className="mt-4 flex items-center space-x-2 px-5 py-2.5 text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl shadow-lg transition-transform hover:scale-105 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Invite Member</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Active Members Grid */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Active Workspace Members ({members.length})</span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {members.map((member) => {
                        const isSelf = member._id === currentUserId;
                        const isOnline = onlineUsers.some(
                          (user) => user.userId?.toString() === member._id?.toString()
                        );
                        const canManage =
                          isOwnerOrAdmin &&
                          !isSelf &&
                          member.role !== "Owner" &&
                          // Admins may manage Editors, Viewers, and Clients,
                          // but not other Admins. The Owner may manage all
                          // non-owner roles.
                          (isOwner || member.role !== "Admin");

                        return (
                          <div
                            key={member._id}
                            className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl transition-all"
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              {/* Avatar with Online indicator */}
                              <div className="relative shrink-0">
                                <div
                                  className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase ${getAvatarColor(
                                    member.name
                                  )}`}
                                >
                                  {member.name?.substring(0, 2) || "U"}
                                </div>
                                <span
                                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-950 ${
                                    isOnline
                                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]"
                                      : "bg-slate-600"
                                  }`}
                                  title={isOnline ? "Online Now" : "Offline"}
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center space-x-1.5">
                                  <p className="text-sm font-semibold text-slate-200 truncate">
                                    {member.name}
                                  </p>
                                  {isSelf && (
                                    <span className="px-1.5 py-0.2 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 rounded">
                                      You
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 truncate">{member.email}</p>
                              </div>
                            </div>

                            {/* Role Badge & Actions */}
                            <div className="flex items-center space-x-2 shrink-0">
                              {/* Assign Task Button for Owner/Admin */}
                              {isOwnerOrAdmin && (
                                <button
                                  onClick={() => handleOpenAssignTask(member)}
                                  className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-medium bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 rounded-lg transition-colors cursor-pointer"
                                  title={`Assign task to ${member.name}`}
                                >
                                  <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                                  <span className="hidden sm:inline">Assign Task</span>
                                </button>
                              )}

                              {canManage ? (
                                <select
                                  value={member.role}
                                  onChange={(e) => handleChangeRole(member._id, e.target.value)}
                                  className="text-xs bg-slate-950 border border-slate-800 text-slate-200 px-2 py-1 rounded-lg focus:outline-none cursor-pointer"
                                >
                                  {isOwner && <option value="Admin">Admin</option>}
                                  <option value="Editor">Editor</option>
                                  <option value="Viewer">Viewer</option>
                                  <option value="Client">Client</option>
                                </select>
                              ) : (
                                <span
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border ${
                                    ROLE_STYLES[member.role] || ROLE_STYLES.Editor
                                  }`}
                                >
                                  {member.role}
                                </span>
                              )}

                              {canManage && (
                                <button
                                  onClick={() => handleRemoveMember(member)}
                                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                  title="Remove Member"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}

                              {!isOwner && isSelf && (
                                <button
                                  onClick={() => handleRemoveMember(member)}
                                  className="text-xs font-semibold text-rose-400 hover:text-rose-300 underline cursor-pointer"
                                >
                                  Leave
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pending Invitations Section */}
                  {isOwnerOrAdmin && (
                    <div className="space-y-3 pt-4 border-t border-slate-900">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                        <Mail className="w-4 h-4 text-indigo-400" />
                        <span>Pending Invitations ({pendingInvites.length})</span>
                      </h3>

                      {pendingInvites.length === 0 ? (
                        <p className="text-xs text-slate-500 italic px-2">
                          No pending invitations.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {pendingInvites.map((invite) => (
                            <div
                              key={invite._id}
                              className="flex items-center justify-between p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-200 truncate">
                                  {invite.email}
                                </p>
                                <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                                  <span className="text-amber-400 font-medium">● Pending</span>
                                  <span>· Role: {invite.role}</span>
                                  <span>
                                    · Sent: {new Date(invite.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center space-x-2 shrink-0">
                                <button
                                  onClick={() => handleResendInvite(invite._id, invite.email)}
                                  disabled={resendingInviteId === invite._id}
                                  className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                                  title="Resend Invitation Email"
                                >
                                  {resendingInviteId === invite._id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-3 h-3" />
                                  )}
                                  <span>Resend</span>
                                </button>
                                <button
                                  onClick={() => handleCancelInvite(invite._id)}
                                  className="px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 rounded-lg transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 2. TASKS TAB */}
          {activeTab === "tasks" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
                    <ListTodo className="w-4 h-4 text-indigo-400" />
                    <span>Project Tasks ({tasks.length})</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Owner and Admins can assign tasks to collaborators and track workflow.
                  </p>
                </div>
                {isOwnerOrAdmin && (
                  <button
                    onClick={() => handleOpenAssignTask()}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Assign Task</span>
                  </button>
                )}
              </div>

              {isLoadingTasks ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                </div>
              ) : tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                  <div className="p-4 rounded-full bg-slate-900 text-slate-400 mb-3">
                    <CheckSquare className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-semibold text-slate-200">
                    No tasks assigned yet
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Organize work across your team. Project Owners and Admins can assign tasks to collaborators.
                  </p>
                  {isOwnerOrAdmin && (
                    <button
                      onClick={() => handleOpenAssignTask()}
                      className="mt-4 flex items-center space-x-2 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl shadow-lg transition-transform hover:scale-105 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Assign First Task</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {tasks.map((task) => {
                    const isAssignee =
                      task.assignedTo?._id?.toString() === currentUserId?.toString() ||
                      task.assignedTo?.toString() === currentUserId?.toString();
                    const canChangeStatus = isOwnerOrAdmin || isAssignee;

                    return (
                      <div
                        key={task._id}
                        className="p-4 bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 rounded-xl space-y-3 transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${
                                  PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.Medium
                                }`}
                              >
                                {task.priority} Priority
                              </span>
                              <h4 className="text-sm font-semibold text-slate-100 break-words">
                                {task.title}
                              </h4>
                            </div>
                            {task.description && (
                              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed whitespace-pre-wrap">
                                {task.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {/* Status selector */}
                            {canChangeStatus ? (
                              <select
                                value={task.status}
                                onChange={(e) => handleStatusChange(task._id, e.target.value)}
                                className={`text-xs px-2.5 py-1 rounded-lg border font-semibold bg-slate-950 cursor-pointer focus:outline-none ${
                                  STATUS_STYLES[task.status] || STATUS_STYLES.Pending
                                }`}
                              >
                                <option value="Pending">Pending</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                                <option value="Blocked">Blocked</option>
                              </select>
                            ) : (
                              <span
                                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${
                                  STATUS_STYLES[task.status] || STATUS_STYLES.Pending
                                }`}
                              >
                                {task.status}
                              </span>
                            )}

                            {isOwnerOrAdmin && (
                              <button
                                onClick={() => handleDeleteTask(task._id)}
                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                title="Delete Task"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Task Meta footer */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-500">Assigned to:</span>
                            <div className="flex items-center space-x-1.5 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800 text-slate-300">
                              <span className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center text-[9px] font-bold text-white uppercase">
                                {task.assignedTo?.name ? task.assignedTo.name[0] : "?"}
                              </span>
                              <span className="font-medium text-slate-200">
                                {task.assignedTo?.name || "Unknown"}
                              </span>
                            </div>
                            {task.assignedBy?.name && (
                              <span className="text-slate-500 hidden sm:inline">
                                by {task.assignedBy.name}
                              </span>
                            )}
                          </div>

                          {task.dueDate && (
                            <div className="flex items-center space-x-1 text-slate-400">
                              <Calendar className="w-3.5 h-3.5 text-slate-500" />
                              <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. VERSIONS TAB */}
          {activeTab === "versions" && (
            <div className="space-y-6">
              {!isReadOnly && (
                <form
                  onSubmit={handleSaveVersion}
                  className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl space-y-3"
                >
                  <label className="block text-xs font-bold uppercase tracking-wider text-indigo-300">
                    Create Version Snapshot
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={versionNote}
                      onChange={(e) => setVersionNote(e.target.value)}
                      placeholder="Describe this milestone snapshot (e.g. Added auth routing)..."
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmitting ? "Saving..." : "Save Version"}
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Snapshot Version History ({versions.length})
                </h3>

                {versions.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
                    No code snapshots saved yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {versions.map((version) => (
                      <div
                        key={version._id}
                        className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl flex items-center justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 rounded-md border border-indigo-500/30">
                              v{version.versionNumber}
                            </span>
                            <span className="text-xs text-slate-400">
                              By {version.createdBy?.name || "Member"} ·{" "}
                              {new Date(version.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-200 font-medium">
                            "{version.description || "Milestone snapshot"}"
                          </p>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => onOpenDiff?.(version)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer"
                          >
                            Compare Diff
                          </button>
                          {!isReadOnly && (
                            <button
                              onClick={() => handleRestoreVersion(version)}
                              className="px-3 py-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 cursor-pointer"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. TIMELINE TAB */}
          {activeTab === "timeline" && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Vertical Activity Timeline
              </h3>

              {activities.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
                  No activity recorded yet.
                </div>
              ) : (
                <div className="relative border-l border-slate-800 ml-4 space-y-6 py-2">
                  {activities.map((activity) => (
                    <div key={activity._id} className="relative pl-6">
                      <span className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-slate-950" />
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-semibold text-indigo-300">
                          {activity.user?.name || "System"}
                        </span>
                        <span>{new Date(activity.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-slate-200 mt-0.5">
                        {describeActivity(activity)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Invite Member Modal Dialog */}
      {isInviteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <form
            onSubmit={handleSendInvite}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-100 animate-in zoom-in duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-slate-100">Invite Team Member</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteDialogOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email Address <span className="text-rose-400">*</span>
              </label>
              <input
                type="email"
                required
                autoFocus
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setEmailError("");
                }}
                placeholder="colleague@example.com"
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
              />
              {emailError && <p className="text-[11px] text-rose-400 mt-1">{emailError}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Role Permission
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value="Admin">Admin (Full edit & invitation rights)</option>
                <option value="Editor">Editor (Edit code & execute sandbox)</option>
                <option value="Viewer">Viewer (Read-only view)</option>
                <option value="Client">Client (Read-only client view)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Custom Message (Optional)
              </label>
              <textarea
                rows={2}
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Join our collaborative workspace project..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsInviteDialogOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center space-x-2 px-5 py-2 text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Send Invitation</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Assign Task Modal Dialog */}
      {isAssignTaskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <form
            onSubmit={handleCreateTask}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-100 animate-in zoom-in duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <CheckSquare className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-slate-100">Assign Project Task</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignTaskOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Task Title <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="e.g., Implement navigation bar, Setup Redux state..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Assign To Collaborator <span className="text-rose-400">*</span>
              </label>
              <select
                value={taskForm.assignedTo}
                onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value="" disabled>Select collaborator</option>
                {members.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} ({m.email}) - {m.role}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Priority
                </label>
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none cursor-pointer"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Task Description / Instructions (Optional)
              </label>
              <textarea
                rows={3}
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="Add details, file paths, requirements, or links..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAssignTaskOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingTask}
                className="flex items-center space-x-2 px-5 py-2 text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingTask ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckSquare className="w-3.5 h-3.5" />
                )}
                <span>Assign Task</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
