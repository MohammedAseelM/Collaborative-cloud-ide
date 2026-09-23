import { Menu, Search } from "lucide-react";
import UserProfile from "./UserProfile";
import NotificationDropdown from "./NotificationDropdown";
import ThemeToggle from "./ThemeToggle";

const Navbar = ({ onMenuClick, searchTerm, onSearchChange }) => {
  return (
    <header className="relative z-50 h-16 shrink-0 border-b border-slate-800 bg-slate-950/80 backdrop-blur px-4 md:px-6 flex items-center gap-4">
      {/* Hamburger - mobile only, opens the Sidebar */}
      <button
        onClick={onMenuClick}
        className="md:hidden text-slate-400 hover:text-slate-200"
        aria-label="Open sidebar"
      >
        <Menu size={22} />
      </button>

      <div className="flex-1 max-w-md relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search projects..."
          className="w-full rounded-md bg-slate-900 border border-slate-800 pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <NotificationDropdown />
        <UserProfile />
      </div>
    </header>
  );
};

export default Navbar;
