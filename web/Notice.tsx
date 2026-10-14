import { useEffect, useRef, useState } from 'react';
import { Check, CircleHelp, X } from 'lucide-react';

export type NoticeMessage = { id: number; text: string; error?: boolean };
export default function Notice({
  message,
  dismiss,
}: {
  message: NoticeMessage | null;
  dismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (
      message &&
      document.activeElement instanceof HTMLElement &&
      !ref.current?.contains(document.activeElement)
    )
      trigger.current = document.activeElement;
    if (!message) setPaused(false);
  }, [message]);
  useEffect(() => {
    if (!message || message.error || paused) return;
    const timer = window.setTimeout(dismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [message, paused, dismiss]);
  const close = () => {
    if (ref.current?.contains(document.activeElement) && trigger.current?.isConnected)
      trigger.current.focus({ preventScroll: true });
    dismiss();
  };
  const content = message && (
    // biome-ignore lint/a11y/noStaticElementInteractions: These listeners pause expiry; the notification itself is not an interactive control.
    <div
      ref={ref}
      className={`toast ${message.error ? 'error-toast' : ''}`}
      role={message.error ? 'alert' : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(ref.current?.contains(document.activeElement) ?? false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      {message.error ? <CircleHelp size={19} /> : <Check size={19} />}
      <span key={message.id}>{message.text}</span>
      <button
        type="button"
        className="icon-button"
        aria-label="Dismiss notification"
        onClick={close}
      >
        <X size={17} />
      </button>
    </div>
  );
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true">
        {!message?.error && content}
      </div>
      {message?.error && content}
    </>
  );
}
