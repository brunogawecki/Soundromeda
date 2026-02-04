import { useState, useRef, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { UploadPanel, type UploadStatus } from './UploadPanel';

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const hoverTooltipMode = useAppStore((s) => s.hoverTooltipMode);
  const setHoverTooltipMode = useAppStore((s) => s.setHoverTooltipMode);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="control-panel" ref={panelRef}>
      <div className="settings-toolbar">
        <UploadPanel
          uploadStatus={uploadStatus}
          setUploadStatus={setUploadStatus}
          setUploadMessage={setUploadMessage}
        />
        <button
          type="button"
          className="settings-trigger"
          onClick={() => setOpen((o) => !o)}
          aria-label="Settings"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <Settings size={22} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="settings-dropdown" role="menu">
          {uploadStatus !== 'idle' && (
            <div className="settings-upload-status">
              {uploadStatus === 'uploading' && <span className="settings-upload-pending">Uploading…</span>}
              {uploadStatus === 'ok' && <span className="settings-upload-ok" role="status">{uploadMessage}</span>}
              {uploadStatus === 'error' && <span className="settings-upload-error" role="alert">{uploadMessage}</span>}
            </div>
          )}
          <div className="settings-group">
            <span className="settings-label">Hover text</span>
            <div className="settings-options">
              <label className="settings-option">
                <input
                  type="radio"
                  name="hoverTooltip"
                  value="follow"
                  checked={hoverTooltipMode === 'follow'}
                  onChange={() => setHoverTooltipMode('follow')}
                />
                <span>Follow cursor</span>
              </label>
              <label className="settings-option">
                <input
                  type="radio"
                  name="hoverTooltip"
                  value="fixed"
                  checked={hoverTooltipMode === 'fixed'}
                  onChange={() => setHoverTooltipMode('fixed')}
                />
                <span>Fixed at bottom</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
