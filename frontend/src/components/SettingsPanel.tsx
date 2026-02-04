import { useState, useRef, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
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
    <div className="settings-panel" ref={panelRef}>
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
      {open && (
        <div className="settings-dropdown" role="menu">
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
