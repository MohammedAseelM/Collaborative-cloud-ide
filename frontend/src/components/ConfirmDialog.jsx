import { Loader2 } from "lucide-react";

const ConfirmDialog = ({
  isOpen = true,
  title,
  message,
  confirmLabel,
  confirmText,
  onConfirm,
  onCancel,
  isDangerous = true,
  confirmVariant,
  isLoading = false,
}) => {
  if (isOpen === false) return null;

  const label = confirmText || confirmLabel || "Confirm";

  let buttonStyle = "bg-red-600 hover:bg-red-500";
  if (confirmVariant === "success") {
    buttonStyle = "bg-emerald-600 hover:bg-emerald-500";
  } else if (confirmVariant === "primary" || isDangerous === false) {
    buttonStyle = "bg-indigo-600 hover:bg-indigo-500";
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/60" onClick={isLoading ? undefined : onCancel} />

      <div className="relative w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">{title}</h2>
        <p className="text-sm text-slate-400 mb-6">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm rounded-md text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-md text-white font-medium transition-colors disabled:opacity-50 cursor-pointer ${buttonStyle}`}
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            <span>{label}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
