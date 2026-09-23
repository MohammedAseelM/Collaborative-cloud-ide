// src/components/UserProfile.jsx
// Responsibility: Show the current user's avatar/name in the navbar,
// and a dropdown with account info and a logout action.

import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, Shield } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const getInitials = (name = "") => {
  return name
    .trim()
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

const UserProfile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close the dropdown when clicking anywhere outside of it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-slate-800 transition-colors cursor-pointer"
      >
        <span className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center">
          {getInitials(user.name)}
        </span>
        <span className="hidden sm:block text-sm text-slate-200">
          {user.name}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border border-slate-800 bg-slate-900 shadow-lg py-2 z-50">
          <div className="px-4 py-2 border-b border-slate-800">
            <p className="text-sm font-medium text-slate-100 truncate">
              {user.name}
            </p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
          
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate("/settings");
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors text-left cursor-pointer"
            >
              <Settings size={16} />
              <span>Settings</span>
            </button>

            {user.role === "admin" && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate("/admin");
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-indigo-400 hover:bg-slate-800 transition-colors text-left cursor-pointer"
              >
                <Shield size={16} />
                <span>Admin Panel</span>
              </button>
            )}
          </div>

          <div className="border-t border-slate-800 mt-1 pt-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-slate-800 transition-colors text-left cursor-pointer"
            >
              <LogOut size={16} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
