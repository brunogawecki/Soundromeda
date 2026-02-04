import { useState, useRef, useEffect } from 'react';
import { Settings, Upload } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const API_BASE = '';

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const hoverTooltipMode = useAppStore((s) => s.hoverTooltipMode);
  const setHoverTooltipMode = useAppStore((s) => s.setHoverTooltipMode);
  const refreshGalaxy = useAppStore((s) => s.refreshGalaxy);

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

  const handleUploadClick = () => {
    setUploadStatus('idle');
    setUploadMessage('');
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadStatus('uploading');
    setUploadMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? 'Upload failed');
      }
      setUploadStatus('ok');
      setUploadMessage(`"${file.name}" added to galaxy`);
      refreshGalaxy();
    } catch (err) {
      setUploadStatus('error');
      setUploadMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="settings-panel" ref={panelRef}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".wav,.mp3,.ogg,.flac,.m4a,.aac"
        className="settings-file-input"
        aria-label="Choose audio file"
        onChange={handleFileChange}
      />
      <div className="settings-toolbar">
        <button
          type="button"
          className="settings-trigger"
          onClick={handleUploadClick}
          disabled={uploadStatus === 'uploading'}
          aria-label={uploadStatus === 'uploading' ? 'Uploading…' : 'Upload sound'}
        >
          <Upload size={22} aria-hidden />
        </button>
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
