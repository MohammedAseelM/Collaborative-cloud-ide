import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

/**
 * ThemeToggle Component
 * A reusable, stylish Sun/Moon theme toggle button.
 */
export const ThemeToggle = ({ className = "" }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
        isDark
          ? "bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800 hover:text-amber-300 shadow-sm"
          : "bg-slate-100 border-slate-200 text-indigo-600 hover:bg-slate-200 hover:text-indigo-500 shadow-sm"
      } ${className}`}
      title={isDark ? "Switch to Light Theme" : "Switch to Dark Theme"}
    >
      {isDark ? (
        <Sun size={16} className="transition-transform duration-300 hover:rotate-45" />
      ) : (
        <Moon size={16} className="transition-transform duration-300 hover:-rotate-12" />
      )}
    </button>
  );
};

export default ThemeToggle;
