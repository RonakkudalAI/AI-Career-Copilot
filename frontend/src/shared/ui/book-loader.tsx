import "./book-loader.css";

type BookLoaderProps = {
  /** Short headline shown under the book */
  title?: string;
  /** Supporting status line (progress text, etc.) */
  message?: string;
  className?: string;
};

/**
 * Page-turning book animation for long-running resume/document work.
 * Pure CSS; respects prefers-reduced-motion.
 */
export function BookLoader({
  title = "Reading your resume",
  message = "This usually takes a few moments…",
  className,
}: BookLoaderProps) {
  return (
    <div
      className={className ? `book-loader ${className}` : "book-loader"}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="book" aria-hidden="true">
        <div className="book__pg-shadow" />
        <div className="book__pg" />
        <div className="book__pg book__pg--2" />
        <div className="book__pg book__pg--3" />
        <div className="book__pg book__pg--4" />
        <div className="book__pg book__pg--5" />
      </div>
      <p className="book-loader__label">
        <strong>{title}</strong>
        {message}
      </p>
    </div>
  );
}
