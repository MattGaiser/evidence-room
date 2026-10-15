import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';

export default function ConnectionPanel({ initial }: { initial: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  const hosted = import.meta.env.VITE_HOSTED_DEMO === '1';
  return (
    <div className={slow && initial ? 'connection-panel' : 'loading-panel'} role="status">
      <LoaderCircle size={28} className="spin" aria-hidden="true" />
      {slow && initial ? (
        <div>
          <h2>{hosted ? 'Cloud Run may be warming up' : 'Connecting to the review workspace'}</h2>
          <p>
            {hosted
              ? 'The server sleeps between visits. Starting it can take up to 45 seconds. Your workspace will open automatically; there is no need to refresh.'
              : 'The workspace is taking longer than usual to respond. We are still connecting; there is no need to refresh.'}
          </p>
        </div>
      ) : (
        <p>{initial ? 'Opening the review workspace…' : 'Opening the submission…'}</p>
      )}
    </div>
  );
}
