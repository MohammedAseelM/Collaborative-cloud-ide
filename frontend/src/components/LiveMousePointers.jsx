import React from "react";

/**
 * LiveMousePointers Component
 * Renders smooth floating SVG mouse cursors for remote collaborators over the editor workspace.
 * Uses top/left percentage positioning relative to parent container so the cursor moves freely across the whole pane.
 */
export const LiveMousePointers = ({ remotePointers = {} }) => {
  const pointers = Object.values(remotePointers);

  if (pointers.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {pointers.map((pointer) => {
        const { userId, username, userColor, mouseX, mouseY } = pointer;
        const color = userColor || "#3b82f6";

        return (
          <div
            key={userId}
            className="absolute transition-all duration-75 ease-out flex items-start gap-1 pointer-events-none select-none"
            style={{
              left: `${mouseX}%`,
              top: `${mouseY}%`,
              willChange: "left, top",
            }}
          >
            {/* SVG Mouse Pointer Icon */}
            <svg
              className="w-5 h-5 drop-shadow-md shrink-0 -ml-1 -mt-1"
              viewBox="0 0 24 24"
              fill={color}
              stroke="#ffffff"
              strokeWidth="1.5"
            >
              <path d="M5.5 3.21l12.5 11.04-6.36 1.48 3.53 6.96-2.52 1.28-3.53-6.96-4.62 4.41V3.21z" />
            </svg>

            {/* Username Tag Badge */}
            <div
              className="px-2 py-0.5 rounded-md text-[11px] font-bold text-white shadow-xl whitespace-nowrap font-sans border border-white/20"
              style={{ backgroundColor: color }}
            >
              {username}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default LiveMousePointers;
