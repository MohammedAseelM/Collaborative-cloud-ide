import React, { useEffect, useState } from "react";
import { CodeXml, Cpu, Cloud, Sparkles, Terminal, CheckCircle2 } from "lucide-react";

/**
 * LoaderScreen Component
 * A state-of-the-art, futuristic loading screen featuring glowing dark ambient gradients,
 * glassmorphic design, dynamic progress tracking, and animated IDE setup logs.
 */
export const LoaderScreen = ({
  title = "Collaborative Cloud IDE",
  subtitle = "Initializing real-time workspace...",
  onComplete,
}) => {
  const [progress, setProgress] = useState(15);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const steps = [
    "Spinning up isolated sandbox container...",
    "Connecting to Socket.IO collaboration mesh...",
    "Mounting Monaco Editor IntelliSense engine...",
    "Restoring workspace files & version history...",
    "Preparing live cursor presence tracking...",
  ];

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          if (onComplete) onComplete();
          return 100;
        }
        const next = prev + Math.floor(Math.random() * 15) + 8;
        return next > 100 ? 100 : next;
      });
    }, 280);

    return () => clearInterval(progressInterval);
  }, [onComplete]);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 600);

    return () => clearInterval(stepInterval);
  }, [steps.length]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-slate-100 overflow-hidden select-none font-sans">
      {/* Background Animated Ambient Glowing Orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-600/20 blur-[120px] animate-pulse" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-cyan-500/20 blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-purple-600/10 blur-[140px] animate-pulse" style={{ animationDelay: "2s" }} />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Main Glass Card Container */}
      <div className="relative z-10 w-11/12 max-w-md p-8 rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-2xl shadow-2xl shadow-indigo-950/40 flex flex-col items-center text-center space-y-6">
        
        {/* Animated Icon Ring */}
        <div className="relative flex items-center justify-center">
          {/* Outer Rotating Glowing Ring */}
          <div className="absolute w-20 h-20 rounded-full border-2 border-transparent border-t-indigo-500 border-r-cyan-400 animate-spin" />
          <div className="absolute w-24 h-24 rounded-full border border-indigo-500/20 animate-ping" />

          {/* Central Logo Box */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 p-0.5 shadow-lg shadow-indigo-500/30 flex items-center justify-center">
            <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center">
              <CodeXml size={30} className="text-cyan-400 animate-bounce" />
            </div>
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              {title}
            </h2>
            <Sparkles size={16} className="text-amber-400 animate-pulse" />
          </div>
          <p className="text-xs text-slate-400 font-medium">{subtitle}</p>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full space-y-2">
          <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 px-1">
            <span className="flex items-center gap-1.5">
              <Cpu size={12} className="text-indigo-400 animate-pulse" />
              <span>SYSTEM BOOT</span>
            </span>
            <span className="font-bold text-cyan-400">{progress}%</span>
          </div>

          {/* Bar track */}
          <div className="w-full h-2.5 bg-slate-950 rounded-full border border-slate-800 p-0.5 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(6,182,212,0.6)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Animated Log Steps Window */}
        <div className="w-full bg-slate-950/80 rounded-xl border border-slate-800/90 p-3 font-mono text-left text-xs space-y-2 shadow-inner">
          <div className="flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-900 pb-1.5 mb-1.5">
            <span className="flex items-center gap-1 text-slate-400 font-semibold">
              <Terminal size={11} className="text-emerald-400" /> STATUS LOGS
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" /> ONLINE
            </span>
          </div>

          <div className="space-y-1.5 max-h-24 overflow-hidden">
            {steps.slice(0, currentStepIndex + 1).map((step, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 text-[11px] transition-all duration-200 ${
                  idx === currentStepIndex
                    ? "text-cyan-300 font-semibold translate-x-0.5"
                    : "text-slate-500"
                }`}
              >
                {idx < currentStepIndex ? (
                  <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
                )}
                <span className="truncate">{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Badge */}
        <div className="pt-1 flex items-center justify-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest font-mono">
          <Cloud size={12} className="text-indigo-400" />
          <span>Real-Time Cloud IDE Engine v2.4</span>
        </div>
      </div>
    </div>
  );
};

export default LoaderScreen;
