
// ================================================
// ERROR ALERT
// ================================================

type ErrorAlertProps = {
  message: string;
  onClose: () => void;
};

export function ErrorAlert({ message, onClose }: ErrorAlertProps) {
  return (
    <div className="rounded-lg border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 p-4">
      <div className="flex items-start gap-3">
        <svg className="h-5 w-5 flex-shrink-0 text-[hsl(var(--destructive))]" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-[hsl(var(--destructive))]">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]/80 transition-colors"
        >
          <span className="sr-only">Dismiss</span>
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
