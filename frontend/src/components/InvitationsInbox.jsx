// src/components/InvitationsInbox.jsx
// Responsibility: Render pending project collaboration invites in a clean list on the Dashboard page.

import { useEffect, useState } from "react";
import { Mail, Check, X, Loader2 } from "lucide-react";
import { fetchUserInvitations, acceptInvitationByIdRequest, rejectInvitationRequest } from "../services/invitation.service";
import { useToast } from "../context/ToastContext";

const InvitationsInbox = ({ onAcceptSuccess }) => {
  const { addToast } = useToast();
  const [invites, setInvites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actioningId, setActioningId] = useState(null); // track which invite is loading an action

  const loadInvitations = async () => {
    try {
      const data = await fetchUserInvitations();
      setInvites(data.invitations || []);
    } catch (err) {
      console.error("Failed to load user invitations:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInvitations();
  }, []);

  const handleAccept = async (inviteId) => {
    setActioningId(inviteId);
    try {
      await acceptInvitationByIdRequest(inviteId);
      addToast("Successfully joined project workspace!", "success");
      
      // Filter out of local state
      setInvites((prev) => prev.filter((i) => i._id !== inviteId));

      // Trigger dashboard project reload
      if (onAcceptSuccess) {
        onAcceptSuccess();
      }
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to accept invitation", "error");
    } finally {
      setActioningId(null);
    }
  };

  const handleDecline = async (inviteId) => {
    setActioningId(inviteId);
    try {
      await rejectInvitationRequest(inviteId);
      addToast("Invitation declined", "info");
      
      // Filter out of local state
      setInvites((prev) => prev.filter((i) => i._id !== inviteId));
    } catch (err) {
      addToast("Failed to decline invitation", "error");
    } finally {
      setActioningId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-6 flex flex-col items-center justify-center text-slate-500 gap-2">
        <Loader2 size={16} className="animate-spin text-indigo-500" />
        <span className="text-xs">Checking invitations inbox...</span>
      </div>
    );
  }

  if (invites.length === 0) return null; // hide if empty

  return (
    <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-900/60 pb-2">
        <Mail size={16} className="text-indigo-400" />
        <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
          Collaboration Invites ({invites.length})
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {invites.map((invite) => {
          const sender = invite.invitedBy?.name || "Developer";
          const projName = invite.project?.name || "Cloud Workspace";
          const language = invite.project?.language || "javascript";

          return (
            <div
              key={invite._id}
              className="bg-slate-950/60 border border-slate-900 rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-300 hover:border-slate-800"
            >
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-semibold text-slate-200 truncate">{projName}</h4>
                <p className="text-[10px] text-slate-500 mt-1">
                  Invited as <span className="text-indigo-400 font-medium">{invite.role}</span> by {sender}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[9px] font-mono capitalize px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    {language}
                  </span>
                  <span className="text-[8px] text-slate-600 font-mono">
                    Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 shrink-0 w-full md:w-auto">
                <button
                  onClick={() => handleAccept(invite._id)}
                  disabled={actioningId !== null}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors cursor-pointer"
                >
                  {actioningId === invite._id ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Check size={11} />
                  )}
                  <span>Accept</span>
                </button>
                <button
                  onClick={() => handleDecline(invite._id)}
                  disabled={actioningId !== null}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded border border-slate-800 transition-colors cursor-pointer"
                >
                  <X size={11} />
                  <span>Decline</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InvitationsInbox;
