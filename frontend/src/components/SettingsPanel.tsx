import { useState, useRef, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { UploadPanel, type UploadStatus } from './UploadPanel';

// Logic (state, click-outside, store)

function useSettingsPanelLogic() {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const hoverTooltipMode = useAppStore((s) => s.hoverTooltipMode);
  const setHoverTooltipMode = useAppStore((s) => s.setHoverTooltipMode);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelContainerRef.current && !panelContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  return {
    isDropdownOpen,
    setIsDropdownOpen,
    panelContainerRef,
    uploadStatus,
    setUploadStatus,
    uploadMessage,
    setUploadMessage,
    hoverTooltipMode,
    setHoverTooltipMode,
  };
}

// UI components (layout and controls)

function SettingsToolbar({
  uploadStatus,
  setUploadStatus,
  setUploadMessage,
  isDropdownOpen,
  onToggleDropdown,
}: {
  uploadStatus: UploadStatus;
  setUploadStatus: (s: UploadStatus) => void;
  setUploadMessage: (m: string) => void;
  isDropdownOpen: boolean;
  onToggleDropdown: () => void;
}) {
  return (
    <div className="settings-toolbar">
      <UploadPanel
        uploadStatus={uploadStatus}
        setUploadStatus={setUploadStatus}
        setUploadMessage={setUploadMessage}
      />
      <button
        type="button"
        className="settings-trigger"
        onClick={onToggleDropdown}
        aria-label="Settings"
        aria-expanded={isDropdownOpen}
        aria-haspopup="true"
      >
        <Settings size={22} aria-hidden />
      </button>
    </div>
  );
}

function UploadStatusMessage({ uploadStatus, uploadMessage }: { uploadStatus: UploadStatus; uploadMessage: string }) {
  if (uploadStatus === 'idle') return null;
  return (
    <div className="settings-upload-status">
      {uploadStatus === 'uploading' && <span className="settings-upload-pending">Uploading…</span>}
      {uploadStatus === 'ok' && <span className="settings-upload-ok" role="status">{uploadMessage}</span>}
      {uploadStatus === 'error' && <span className="settings-upload-error" role="alert">{uploadMessage}</span>}
    </div>
  );
}

function HoverTooltipOptions({ hoverTooltipMode, setHoverTooltipMode }: { hoverTooltipMode: string; setHoverTooltipMode: (mode: 'follow' | 'fixed') => void }) {
  return (
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
  );
}

function SettingsDropdown({ uploadStatus, uploadMessage, hoverTooltipMode, setHoverTooltipMode }: { uploadStatus: UploadStatus; uploadMessage: string; hoverTooltipMode: string; setHoverTooltipMode: (mode: 'follow' | 'fixed') => void }) {
  return (
    <div className="settings-dropdown" role="menu">
      <UploadStatusMessage uploadStatus={uploadStatus} uploadMessage={uploadMessage} />
      <HoverTooltipOptions hoverTooltipMode={hoverTooltipMode} setHoverTooltipMode={setHoverTooltipMode} />
    </div>
  );
}

export function SettingsPanel() {
  const logic = useSettingsPanelLogic();

  return (
    <div className="control-panel" ref={logic.panelContainerRef}>
      <SettingsToolbar
        uploadStatus={logic.uploadStatus}
        setUploadStatus={logic.setUploadStatus}
        setUploadMessage={logic.setUploadMessage}
        isDropdownOpen={logic.isDropdownOpen}
        onToggleDropdown={() => logic.setIsDropdownOpen((o) => !o)}
      />
      {logic.isDropdownOpen && (
        <SettingsDropdown
          uploadStatus={logic.uploadStatus}
          uploadMessage={logic.uploadMessage}
          hoverTooltipMode={logic.hoverTooltipMode}
          setHoverTooltipMode={logic.setHoverTooltipMode}
        />
      )}
    </div>
  );
}
