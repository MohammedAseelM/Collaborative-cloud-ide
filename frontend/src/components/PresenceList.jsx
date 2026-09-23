import React from "react";

/**
 * PresenceList Component
 * Displays live presence for all project collaborators, showing who is online,
 * typing status, and which file they are currently viewing/editing.
 * Clicking any avatar circle triggers onSelectCollaborator to view full profile details.
 */
export const PresenceList = ({ presenceList = [], compact = false, onSelectCollaborator }) => {
  if (!presenceList || presenceList.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic p-2">
        No active collaborators online
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex -space-x-2 overflow-hidden items-center">
        {presenceList.map((u) => (
          <div
            key={u.userId}
            onClick={() => onSelectCollaborator && onSelectCollaborator(u)}
            className="relative group cursor-pointer shrink-0 transition-transform hover:z-20 hover:scale-110"
            title={`Click to view ${u.name}'s working details`}
          >
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-slate-950 uppercase shadow-md active:scale-95"
              style={{ backgroundColor: u.color }}
            >
              {u.name.substring(0, 2)}
            </div>

            {/* Status Ping Dot */}
            <span
              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-slate-950 ${u.statusColor} ${
                u.isTyping ? "animate-ping" : ""
              }`}
            />

            {/* Hover Tooltip */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 bg-slate-900 border border-slate-800 text-xs text-slate-200 px-2.5 py-1 rounded-lg shadow-2xl whitespace-nowrap z-50 pointer-events-none transition-all duration-150 origin-top">
              <span className="font-semibold text-slate-100">{u.name}</span>
              {u.isSelf && <span className="text-indigo-400 font-bold ml-1">(You)</span>}
              <div className="text-[10px] text-slate-400 font-medium">
                {u.statusText} • <span className="text-cyan-400 font-semibold">Click details</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Live Presence ({presenceList.length})
      </h4>
      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
        {presenceList.map((u) => (
          <div
            key={u.userId}
            onClick={() => onSelectCollaborator && onSelectCollaborator(u)}
            className="p-2 rounded-xl border border-slate-900 bg-slate-900/30 flex items-center gap-2.5 transition-all hover:bg-slate-900/60 cursor-pointer"
          >
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase shrink-0"
              style={{ backgroundColor: u.color }}
            >
              {u.name.substring(0, 2)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {u.name}
                </span>
                {u.isSelf && (
                  <span className="text-[10px] bg-indigo-950 text-indigo-400 font-bold px-1.5 py-0.2 rounded border border-indigo-800">
                    You
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${u.statusColor}`} />
                <span>{u.statusText}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PresenceList;
