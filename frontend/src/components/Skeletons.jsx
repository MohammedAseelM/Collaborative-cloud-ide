import LoaderScreen from "./LoaderScreen";

export const DashboardSkeleton = () => {
  return (
    <div className="w-full space-y-6 animate-pulse">
      {/* Search & Header Section */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-800 rounded" />
          <div className="h-4 w-64 bg-slate-800/60 rounded" />
        </div>
        <div className="h-10 w-32 bg-slate-800 rounded" />
      </div>

      {/* Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-36 rounded-lg border border-slate-900 bg-slate-900/60 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 bg-slate-800 rounded-full" />
                <div className="h-4 w-28 bg-slate-800 rounded" />
              </div>
              <div className="h-4 w-12 bg-slate-800 rounded" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-slate-800/80 rounded" />
              <div className="h-3 w-4/5 bg-slate-800/80 rounded" />
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="h-4 w-20 bg-slate-800/50 rounded" />
              <div className="h-3 w-24 bg-slate-800/50 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const WorkspaceSkeleton = ({ title, subtitle }) => {
  return <LoaderScreen title={title} subtitle={subtitle} />;
};

export { LoaderScreen };

