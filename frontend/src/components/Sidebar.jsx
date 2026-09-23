import { Code2, LayoutDashboard, Settings, X, Terminal } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { label: "Online Compiler", icon: Terminal, path: "/playground" },
    { label: "Settings", icon: Settings, path: "/settings" },
  ];

  const handleNavClick = (path) => {
    navigate(path);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile overlay backdrop - clicking it closes the sidebar */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden animate-fade-in"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-40
          w-64 shrink-0 bg-slate-900 border-r border-slate-800
          flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
        `}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800">
          <div className="flex items-center gap-2 text-slate-100">
            <Code2 size={20} className="text-indigo-400" />
            <span className="font-semibold select-none">Cloud IDE</span>
          </div>
          {/* Close button only shown on mobile */}
          <button
            onClick={onClose}
            className="md:hidden text-slate-400 hover:text-slate-200 cursor-pointer"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <button
                key={item.label}
                onClick={() => handleNavClick(item.path)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
                  transition-colors cursor-pointer text-left
                  ${
                    isActive
                      ? "bg-indigo-600/15 text-indigo-300 font-semibold border-l-2 border-indigo-500"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }
                `}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-slate-800 text-xs text-slate-500 font-mono select-none">
          Active Environment
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
