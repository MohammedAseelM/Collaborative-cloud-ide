// src/components/ConfirmDialog.jsx
// Responsibility: Generic confirmation modal, used here to confirm
// destructive actions like deleting a project before they happen.

const ConfirmDialog = ({
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
  isDangerous = true,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/60" onClick={onCancel} />

      <div className="relative w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">{title}</h2>
        <p className="text-sm text-slate-400 mb-6">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-md text-white font-medium transition-colors ${
              isDangerous
                ? "bg-red-600 hover:bg-red-500"
                : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
