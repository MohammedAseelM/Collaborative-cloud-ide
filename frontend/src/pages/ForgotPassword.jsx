// src/pages/ForgotPassword.jsx
// Responsibility: Forgot Password UI. Collects email address, sends request
// to backend to generate reset token, and displays visual success feedback.

import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPasswordRequest } from "../services/auth.service";
import { useToast } from "../context/ToastContext";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { addToast } = useToast();

  const validateForm = () => {
    if (!email) {
      setError("Email address is required");
      return false;
    }
    if (!/^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$/.test(email)) {
      setError("Please enter a valid email address");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setSuccessMsg("");
    try {
      const data = await forgotPasswordRequest(email);
      setSuccessMsg(data.message || "If that email exists in our system, we've sent a password reset link.");
      addToast("Reset link sent successfully!", "success");
      
      // In development environment, log the token to help
      if (data.token) {
        console.log(`[Dev Helpers] Reset Token: ${data.token}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to request password reset. Try again.");
      addToast("Password reset request failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 select-none">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-2">
          <Link
            to="/login"
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
            aria-label="Back to login"
          >
            <ArrowLeft size={16} />
          </Link>
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
            Password Recovery
          </span>
        </div>

        <h1 className="text-2xl font-semibold text-slate-100 mb-1">
          Forgot Password?
        </h1>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          No worries! Input your account email, and we'll send a password recovery reset link.
        </p>

        {successMsg ? (
          <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-5 text-center space-y-4">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-950 border border-indigo-500/30">
              <Mail size={18} className="text-indigo-400" />
            </div>
            <p className="text-sm text-indigo-300 leading-normal">
              {successMsg}
            </p>
            <Link
              to="/login"
              className="mt-2 block w-full rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 text-sm transition-colors text-center"
            >
              Return to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div>
              <label htmlFor="email" className="block text-sm text-slate-300 mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                className="w-full rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2 text-sm transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Requesting Reset...</span>
                </>
              ) : (
                <span>Send Reset Link</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
