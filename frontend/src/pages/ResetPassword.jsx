// src/pages/ResetPassword.jsx
// Responsibility: Reset Password UI. Collects new password, verifies it matches
// the confirmation field, and submits it with the reset token to the backend.

import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { resetPasswordRequest } from "../services/auth.service";
import { useToast } from "../context/ToastContext";
import { Lock, CheckCircle2, Loader2 } from "lucide-react";

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = () => {
    if (!password) {
      setError("New password is required");
      return false;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await resetPasswordRequest(token, password);
      setIsSuccess(true);
      addToast("Password reset successful!", "success");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid or expired reset token. Try again.");
      addToast("Password reset failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 select-none">
      <div className="w-full max-w-sm">
        <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider block mb-2">
          New Credentials
        </span>
        <h1 className="text-2xl font-semibold text-slate-100 mb-1">
          Reset Password
        </h1>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          Create a new, strong password to secure your Collaborative workspace account.
        </p>

        {isSuccess ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-5 text-center space-y-4">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-950 border border-emerald-500/30">
              <CheckCircle2 size={18} className="text-emerald-400" />
            </div>
            <p className="text-sm text-emerald-300 leading-normal">
              Your password has been successfully reset. You can now log back into your account.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="mt-2 block w-full rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 text-sm transition-colors text-center cursor-pointer"
            >
              Go to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div>
              <label htmlFor="password" className="block text-sm text-slate-300 mb-1">
                New Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                className="w-full rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm text-slate-300 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError("");
                }}
                className="w-full rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !password.trim() || !confirmPassword.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2 text-sm transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Saving Password...</span>
                </>
              ) : (
                <span>Reset Password</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
