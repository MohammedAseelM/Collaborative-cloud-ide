// src/components/RealtimeAlertModal.jsx
// Responsibility: Instant interactive popup alert when an invitation or task assignment
// is received in real-time, allowing immediate Accept/Decline or View actions without refreshing.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, CheckSquare, X, Check, ArrowRight, Loader2, Clock, Shield } from "lucide-react";
import { useNotification } from "../context/NotificationContext";
import { acceptInvitationByIdRequest, rejectInvitationRequest } from "../services/invitation.service";
import { useToast } from "../context/ToastContext";

export const RealtimeAlertModal = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const {
    activePopup,
    closePopup,
    refreshInvitations,
    refreshNotifications,
  } = useNotification();

  const [isProcessing, setIsProcessing] = useState(false);

  if (!activePopup) return null;

  const handleAcceptInvite = async () => {
    const inviteId = activePopup.data?.invitationId || activePopup.data?.invitation?._id || activePopup.data?._id;
    if (!inviteId) return;

    setIsProcessing(true);
    try {
      await acceptInvitationByIdRequest(inviteId);
      addToast(`Joined project "${activePopup.data.projectName || "Workspace"}" successfully!`, "success");
      refreshInvitations();
      refreshNotifications();
      closePopup();
      if (activePopup.data.projectId) {
        navigate(`/workspace/${activePopup.data.projectId}`);
      }
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to accept invitation", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeclineInvite = async () => {
    const inviteId = activePopup.data?.invitationId || activePopup.data?.invitation?._id || activePopup.data?._id;
    if (!inviteId) return;

    setIsProcessing(true);
    try {
      await rejectInvitationRequest(inviteId);
      addToast("Invitation declined", "info");
      refreshInvitations();
      refreshNotifications();
      closePopup();
    } catch (err) {
      addToast("Failed to decline invitation", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenTaskProject = () => {
    const pId = activePopup.data?.projectId || activePopup.data?.task?.project;
    closePopup();
    if (pId) {
      navigate(`/workspace/${pId}`);
    }
  };

  const isInvite = activePopup.type === "INVITE";
  const isTask = activePopup.type === "TASK";

  return (
    <div className="fixed top-5 right-5 z-[9999] max-w-sm w-full animate-slide-in select-none">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-500/40 bg-slate-950/95 p-5 shadow-2xl shadow-indigo-950/50 backdrop-blur-xl transition-all">
        {/* Glowing Ambient Gradient */}
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-indigo-600/20 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-cyan-600/15 blur-2xl pointer-events-none" />

        {/* Header Bar */}
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                isInvite
                  ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-400"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {isInvite ? <Mail size={18} /> : <CheckSquare size={18} />}
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                {isInvite ? "New Project Invitation" : "Task Assigned"}
              </span>
              <h4 className="text-sm font-semibold text-slate-100 line-clamp-1">
                {activePopup.data?.projectName || "Collaborative Cloud IDE"}
              </h4>
            </div>
          </div>

          <button
            onClick={closePopup}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-3.5 space-y-2 relative z-10">
          {isInvite && (
            <>
              <p className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-slate-100">{activePopup.data?.inviterName || "A collaborator"}</strong> invited you to join{" "}
                <span className="text-indigo-300 font-medium">"{activePopup.data?.projectName}"</span> as an{" "}
                <span className="rounded bg-indigo-950/70 border border-indigo-800/60 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">
                  {activePopup.data?.role || "Editor"}
                </span>
              </p>
              {activePopup.data?.expiresAt && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-1">
                  <Clock size={11} />
                  <span>Valid for 7 days</span>
                </div>
              )}
            </>
          )}

          {isTask && (
            <>
              <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-xs font-bold text-slate-200 line-clamp-1">
                    {activePopup.data?.title || activePopup.data?.task?.title}
                  </h5>
                  {activePopup.data?.priority && (
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                        activePopup.data.priority === "high"
                          ? "bg-red-950/50 border-red-900/40 text-red-400"
                          : activePopup.data.priority === "medium"
                          ? "bg-amber-950/50 border-amber-900/40 text-amber-400"
                          : "bg-blue-950/50 border-blue-900/40 text-blue-400"
                      }`}
                    >
                      {activePopup.data.priority}
                    </span>
                  )}
                </div>
                {activePopup.data?.description && (
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                    {activePopup.data.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                  <span>Assigned by {activePopup.data?.assignedByName || "Admin"}</span>
                  {activePopup.data?.dueDate && (
                    <span>Due: {new Date(activePopup.data.dueDate).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex items-center gap-2 relative z-10">
          {isInvite && (
            <>
              <button
                onClick={handleAcceptInvite}
                disabled={isProcessing}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>Accept & Open</span>
              </button>
              <button
                onClick={handleDeclineInvite}
                disabled={isProcessing}
                className="rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                Decline
              </button>
            </>
          )}

          {isTask && (
            <>
              <button
                onClick={handleOpenTaskProject}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
              >
                <span>View in Workspace</span>
                <ArrowRight size={13} />
              </button>
              <button
                onClick={closePopup}
                className="rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 transition-colors cursor-pointer"
              >
                Later
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RealtimeAlertModal;
