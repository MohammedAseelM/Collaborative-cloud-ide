import React, { useEffect, useState } from "react";

/**
 * LiveMousePointers Component
 * Renders smooth floating SVG mouse cursors for remote collaborators over the editor workspace.
 * When pointing at code, aligns precisely with the editor's scrolled line and column position.
 */
export const LiveMousePointers = ({ remotePointers = {}, editorRef }) => {
  const pointers = Object.values(remotePointers);
  const [, setScrollTick] = useState(0);

  // Re-calculate positions whenever Monaco Editor scrolls
  useEffect(() => {
    const editor = editorRef?.current;
    if (!editor || typeof editor.onDidScrollChange !== "function") return;

    const disposable = editor.onDidScrollChange(() => {
      setScrollTick((t) => (t + 1) % 10000);
    });

    return () => {
      disposable?.dispose?.();
    };
  }, [editorRef]);

  if (pointers.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {pointers.map((pointer) => {
        const {
          userId,
          username,
          userColor,
          mouseX,
          mouseY,
          lineNumber,
          column,
          offsetX = 0,
          offsetY = 0,
        } = pointer;
        const color = userColor || "#3b82f6";

        let leftStyle = `${mouseX}%`;
        let topStyle = `${mouseY}%`;
        let isVisible = true;

        // If line & column are tracked from collaborator, align with code line position
        if (lineNumber && column && editorRef?.current) {
          try {
            const vis = editorRef.current.getScrolledVisiblePosition({ lineNumber, column });
            if (vis) {
              leftStyle = `${vis.left + (offsetX || 0)}px`;
              topStyle = `${vis.top + (offsetY || 0)}px`;
            } else {
              // Line is currently outside the scrolled viewport, hide to avoid false line overlap
              isVisible = false;
            }
          } catch {
            // Fallback to viewport relative percentage
          }
        }

        if (!isVisible) return null;

        return (
          <div
            key={userId}
            className="absolute transition-all duration-75 ease-out flex items-start gap-1 pointer-events-none select-none"
            style={{
              left: leftStyle,
              top: topStyle,
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
