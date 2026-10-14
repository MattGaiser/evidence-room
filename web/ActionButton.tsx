import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Keep unavailable actions discoverable by keyboard and touch, while guarding activation.
export default function ActionButton({
  children,
  className,
  disabled,
  explanation,
  onClick,
  onBlocked,
  onExplainChange,
}: {
  children: ReactNode;
  className: string;
  disabled: boolean;
  explanation: ReactNode;
  onClick: () => void;
  onBlocked?: () => void;
  onExplainChange?: (visible: boolean) => void;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const reason = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [requested, setRequested] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const visible = disabled && !dismissed && (hovered || focused || requested);
  useEffect(() => {
    onExplainChange?.(visible);
    return () => onExplainChange?.(false);
  }, [visible, onExplainChange]);
  useEffect(() => {
    if (!visible) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (reason.current?.contains(document.activeElement))
        button.current?.focus({ preventScroll: true });
      setRequested(false);
      setDismissed(true);
    };
    window.addEventListener('keydown', dismissOnEscape);
    return () => window.removeEventListener('keydown', dismissOnEscape);
  }, [visible]);
  return (
    <fieldset
      className="action-explanation"
      onMouseEnter={() => {
        setHovered(true);
        setDismissed(false);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => {
        setFocused(true);
        setDismissed(false);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={className}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? id : undefined}
        onClick={() => {
          if (disabled) {
            setRequested(true);
            setDismissed(false);
            onBlocked?.();
          } else onClick();
        }}
      >
        {children}
      </button>
      <div ref={reason} id={id} className="action-reason" hidden={!visible}>
        {explanation}
      </div>
    </fieldset>
  );
}
