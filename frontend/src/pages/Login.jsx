// src/pages/Login.jsx
// Responsibility: Login form UI. Collects email/password, supports Google Sign-In,
// calls AuthContext.login / loginWithGoogle, and redirects to dashboard.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { googleAuthErrorMessage, useGoogleSignIn } from "../hooks/useGoogleSignIn";

const Login = () => {
  const { login, loginWithGoogle } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const googleConfigured = useGoogleSignIn({
    buttonId: "google-signin-btn",
    onCredential: async (credential) => {
      setIsSubmitting(true);
      setFormError("");
      try {
        await loginWithGoogle(credential);
        addToast("Logged in with Google successfully!", "success");
        navigate("/dashboard");
      } finally {
        setIsSubmitting(false);
      }
    },
    onError: (err) => {
      setFormError(googleAuthErrorMessage(err));
      addToast("Google Sign-In failed", "error");
      setIsSubmitting(false);
    },
  });

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await login(formData);
      navigate("/dashboard");
    } catch (error) {
      const responseData = error.response?.data;

      if (responseData?.errors) {
        const errorsByField = {};
        responseData.errors.forEach((err) => {
          errorsByField[err.field] = err.message;
        });
        setFieldErrors(errorsByField);
      } else {
        setFormError(responseData?.message || "Invalid email or password");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 animate-fade-in">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-slate-100 mb-1">
          Welcome back
        </h1>
        <p className="text-slate-400 text-sm mb-6 select-none">
          Log in to continue to your projects.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-md px-3 py-2">
              {formError}
            </p>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm text-slate-300 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="jane@example.com"
            />
            {fieldErrors.email && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label
                htmlFor="password"
                className="block text-sm text-slate-300"
              >
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full rounded-md bg-slate-900 border border-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              placeholder="••••••••"
            />
            {fieldErrors.password && (
              <p className="text-xs text-red-400 mt-1">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2 transition-colors cursor-pointer"
          >
            {isSubmitting ? "Logging in..." : "Log in"}
          </button>
        </form>

        {/* Google Authentication Section Divider */}
        <div className="relative my-6 select-none">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-850" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-slate-950 px-2 text-slate-500 font-bold select-none tracking-wider">
              Or continue with
            </span>
          </div>
        </div>

        {/* Google OAuth Login Button */}
        {!googleConfigured ? (
          <button
            type="button"
            onClick={() => addToast("Please set VITE_GOOGLE_CLIENT_ID in your .env file to enable Google authentication.", "warning")}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-slate-900 border border-slate-850 hover:bg-slate-800 hover:border-slate-700 text-slate-400 font-medium py-2 transition-colors cursor-pointer text-xs"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            <span>Google Authentication</span>
          </button>
        ) : (
          <div id="google-signin-btn" className="w-full flex justify-center overflow-hidden min-h-[40px]" />
        )}

        <p className="text-sm text-slate-400 mt-6 text-center select-none">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="text-indigo-400 hover:text-indigo-300"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
