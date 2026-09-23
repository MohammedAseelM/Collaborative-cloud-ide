// src/pages/Settings.jsx
// Responsibility: Allow users to edit profile, change password, manage IDE/editor styles, and delete their account.

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Shield, Sliders, Trash2, ChevronLeft, Loader2 } from "lucide-react";
import { updateProfileRequest, updatePasswordRequest, deleteAccountRequest } from "../services/user.service";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";

const Settings = () => {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("profile"); // "profile" | "password" | "preferences" | "danger"

  // Profile forms state
  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Editor Preferences state
  const [fontSize, setFontSize] = useState(14);
  const [autosave, setAutosave] = useState(true);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedFontSize = localStorage.getItem("ide_font_size");
    const savedTheme = localStorage.getItem("ide_theme");
    const savedAutosave = localStorage.getItem("ide_autosave");

    if (savedFontSize) setFontSize(parseInt(savedFontSize, 10));
    if (savedTheme === "vs-dark") setTheme("dark");
    else if (savedTheme) setTheme(savedTheme);
    if (savedAutosave) setAutosave(savedAutosave === "true");
  }, []);

  const handleSavePreferences = (e) => {
    e.preventDefault();
    localStorage.setItem("ide_font_size", fontSize);
    setTheme(theme);
    localStorage.setItem("ide_autosave", autosave.toString());
    addToast("Editor preferences saved successfully", "success");
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim() || !profileEmail.trim()) {
      addToast("Name and email are required", "error");
      return;
    }

    setIsUpdatingProfile(true);
    try {
      await updateProfileRequest({ name: profileName, email: profileEmail });
      addToast("Profile details updated successfully", "success");
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to update profile", "error");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      addToast("All password fields are required", "error");
      return;
    }

    if (newPassword.length < 8) {
      addToast("New password must be at least 8 characters long", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      addToast("New passwords do not match", "error");
      return;
    }

    setIsChangingPassword(true);
    try {
      await updatePasswordRequest({ currentPassword, newPassword });
      addToast("Password changed successfully", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      addToast(err.response?.data?.message || "Incorrect current password", "error");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirm = window.confirm(
      "WARNING: This action is permanent. Deleting your account will remove all your projects, files, histories, and collaborator bindings. Are you sure you want to proceed?"
    );
    if (!confirm) return;

    try {
      await deleteAccountRequest();
      addToast("Account deleted successfully", "success");
      await logout();
      navigate("/login");
    } catch (err) {
      addToast("Failed to delete account", "error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Navbar Header */}
      <header className="h-14 border-b border-slate-900 bg-slate-950 px-4 md:px-6 flex items-center gap-4 shrink-0">
        <Link
          to="/dashboard"
          className="p-1.5 rounded hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-sm font-semibold text-slate-100">Account Configuration</h1>
      </header>

      {/* Main Settings Frame */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 flex flex-col md:flex-row gap-6 min-h-0">
        {/* Sidebar Nav */}
        <aside className="w-full md:w-56 flex md:flex-col gap-1 shrink-0 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "profile"
                ? "bg-slate-900 text-indigo-400 border border-slate-800"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <User size={15} />
            <span>Profile Settings</span>
          </button>
          <button
            onClick={() => setActiveTab("password")}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "password"
                ? "bg-slate-900 text-indigo-400 border border-slate-800"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <Shield size={15} />
            <span>Security & Password</span>
          </button>
          <button
            onClick={() => setActiveTab("preferences")}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "preferences"
                ? "bg-slate-900 text-indigo-400 border border-slate-800"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
            }`}
          >
            <Sliders size={15} />
            <span>Appearance & Workspace</span>
          </button>
          <button
            onClick={() => setActiveTab("danger")}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "danger"
                ? "bg-red-950/20 text-red-400 border border-red-900/30"
                : "text-red-500/70 hover:text-red-400 hover:bg-red-950/10"
            }`}
          >
            <Trash2 size={15} />
            <span>Danger Zone</span>
          </button>
        </aside>

        {/* Content Container */}
        <main className="flex-1 bg-slate-900/20 border border-slate-900 rounded-xl p-6 min-h-0 overflow-y-auto max-w-xl">
          {/* Tab 1: Profile */}
          {activeTab === "profile" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-slate-100 mb-1">Profile Details</h2>
                <p className="text-xs text-slate-500">Update your account name and email address settings.</p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                    placeholder="Enter name"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                    placeholder="Enter email"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingProfile}
                  className="flex items-center justify-center gap-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingProfile ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Tab 2: Password */}
          {activeTab === "password" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-slate-100 mb-1">Update Password</h2>
                <p className="text-xs text-slate-500">Ensure your account is protected with a secure password credential.</p>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                    placeholder="••••••••"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                    placeholder="Repeat new password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="flex items-center justify-center gap-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Change Password</span>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Tab 3: Workspace Preferences */}
          {activeTab === "preferences" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-slate-100 mb-1">Editor Configuration</h2>
                <p className="text-xs text-slate-500">Configure font size, theme color, and file autosaving behaviors.</p>
              </div>

              <form onSubmit={handleSavePreferences} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Font Size (px)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="28"
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                    className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Project Theme
                  </label>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="dark">Dark Theme (Default)</option>
                    <option value="light">Light Theme</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800/60 bg-slate-950/20">
                  <div className="space-y-0.5">
                    <label className="text-xs font-semibold text-slate-200 block">Autosave Workspace Changes</label>
                    <span className="text-[10px] text-slate-500 block">Saves edits automatically 2 seconds after typing.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autosave}
                    onChange={(e) => setAutosave(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950"
                  />
                </div>

                <button
                  type="submit"
                  className="rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 transition-colors cursor-pointer"
                >
                  Save Settings
                </button>
              </form>
            </div>
          )}

          {/* Tab 4: Danger Zone */}
          {activeTab === "danger" && (
            <div className="space-y-6">
              <div className="border border-red-900/30 rounded-xl bg-red-950/10 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-red-400 mb-1 flex items-center gap-1.5">
                    <Trash2 size={16} />
                    <span>Delete User Account</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Once you delete your account, there is no going back. All of your personal projects, file trees, SNAPSHOT files, logs, and collaborators bindings will be permanently deleted from our system.
                  </p>
                </div>

                <button
                  onClick={handleDeleteAccount}
                  className="rounded bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-4 py-2 transition-colors cursor-pointer"
                >
                  Delete Account Permanently
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Settings;
