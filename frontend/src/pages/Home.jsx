// src/pages/Home.jsx
// Responsibility: Professional landing page for the Collaborative Cloud IDE.
// Showcases core features, manages active session routing redirects, and
// checks backend connection health.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchHealthStatus } from "../services/health.service";
import { 
  Code2, 
  Terminal, 
  Users2, 
  History, 
  ArrowRight, 
  ShieldCheck, 
  Activity, 
  Zap 
} from "lucide-react";

const Home = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const data = await fetchHealthStatus();
        setHealth(data);
      } catch (err) {
        setError("Offline");
      }
    };
    checkBackend();
  }, []);

  return (
    <div className="min-h-screen bg-[#090d16] text-[#f1f5f9] font-sans overflow-x-hidden selection:bg-indigo-500 selection:text-white relative">
      {/* Decorative Radial Gradients */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Header Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-md sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Code2 className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent tracking-tight">
              CloudIDE
            </span>
          </div>

          <nav className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <span className="hidden sm:inline text-sm text-slate-400">
                  Welcome, <strong className="text-slate-200">{user.name}</strong>
                </span>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center px-4 h-9 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/10"
                >
                  Dashboard
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center px-4 h-9 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/10"
                >
                  Get Started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 relative z-10">
        <div className="text-center max-w-3xl mx-auto">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-400 mb-6 tracking-wide uppercase">
            <Zap className="h-3 w-3 fill-indigo-400/20" />
            Real-Time Collaboration Platform
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Write, Execute & Sync
            <span className="block mt-2 bg-gradient-to-r from-indigo-400 via-indigo-500 to-emerald-400 bg-clip-text text-transparent">
              Code in Real-Time
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 mb-10 leading-relaxed font-normal">
            A production-ready browser IDE built for team-based development. Code simultaneously, compile inside isolated containers, track timelines, and manage permissions.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5"
              >
                Go to Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5"
                >
                  Start Coding Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
                <Link
                  to="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800 transition-all hover:-translate-y-0.5"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Feature Grid */}
        <section className="mt-28">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-200">
              IDE Core Features
            </h2>
            <p className="text-slate-400 mt-2 text-sm sm:text-base">
              A comprehensive toolkit engineered for high-performance developer teams.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 backdrop-blur-sm hover:border-slate-700/80 transition-all duration-300 group hover:-translate-y-1">
              <div className="h-12 w-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Code2 className="h-6 w-6 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-200 mb-2">Monaco Code Editor</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Powered by Microsoft's editor engine. Fully equipped with syntax highlighting, code auto-completion, and local customization options.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 backdrop-blur-sm hover:border-slate-700/80 transition-all duration-300 group hover:-translate-y-1">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Users2 className="h-6 w-6 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-200 mb-2">Live Multi-User Collaboration</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Everyone editing the same file sees live typing, a named cursor, and a matching mouse pointer in their own colour.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 backdrop-blur-sm hover:border-slate-700/80 transition-all duration-300 group hover:-translate-y-1">
              <div className="h-12 w-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Terminal className="h-6 w-6 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-200 mb-2">Isolated Docker Sandbox</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Run script file outputs securely inside memory-constrained Docker compilation containers. Safe from loops and external scripts.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 backdrop-blur-sm hover:border-slate-700/80 transition-all duration-300 group hover:-translate-y-1">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <History className="h-6 w-6 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-200 mb-2">Snapshot Timeline</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Record and save code state snapshots, review historical timeline logs, and perform full workspace restorations.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Connectivity Bar */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-6 mt-16 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} Collaborative Cloud IDE. Capstone Project.
          </p>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500">System Connection:</span>
            {error ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Offline
              </span>
            ) : health ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Online (DB: {health.database})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 font-medium">
                Checking...
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
