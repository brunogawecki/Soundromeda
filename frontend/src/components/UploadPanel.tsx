import { useState, useRef, useEffect } from 'react';
import { Upload, Play, FileUp, FolderUp, Trash2, ListChecks } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { playAudioUrl } from '../useTone';
const API_BASE = '';

/** Show only the file name (last path segment), not folder path. */
function displayOnlySoundFileName(name: string): string {
  if (!name) return 'Unknown';
  const i = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  return i === -1 ? name : name.slice(i + 1);
}

interface UploadedFile {
  id: number;
  name: string;
  audioUrl: string;
}

export type UploadStatus = 'idle' | 'uploading' | 'ok' | 'error';

interface UploadPanelProps {
  uploadStatus: UploadStatus;
  setUploadStatus: (s: UploadStatus) => void;
  setUploadMessage: (m: string) => void;
}

// Logic (data fetching, state, event handlers)

async function fetchUserUploadedSounds(): Promise<UploadedFile[]> {
  const response = await fetch(`${API_BASE}/api/sounds?source=user`);
  const responseData = response.ok ? await response.json() : { points: [] };
  const points = Array.isArray(responseData?.points) ? responseData.points : [];
  return points.map((point: { id?: number; name?: string; audioUrl?: string }) => ({
    id: typeof point.id === 'number' ? point.id : 0,
    name: point.name ?? 'Unknown',
    audioUrl: point.audioUrl ?? '',
  }));
}

async function fetchAllBuiltinIds(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/sounds/builtin-ids`);
  const data = res.ok ? await res.json() : { ids: [] };
  return Array.isArray(data?.ids) ? data.ids : [];
}

export type ConfirmAction = null | 'delete-all-builtin' | 'delete-all-user';

function useUploadPanelLogic({ setUploadStatus, setUploadMessage }: UploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadWrapRef = useRef<HTMLDivElement>(null);
  const [isUploadDropdownOpen, setIsUploadDropdownOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const refreshGalaxy = useAppStore((s) => s.refreshGalaxy);
  const setHighlightedListAudioUrl = useAppStore((s) => s.setHighlightedListAudioUrl);

  useEffect(() => {
    if (!isUploadDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (uploadWrapRef.current && !uploadWrapRef.current.contains(e.target as Node)) {
        setIsUploadDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isUploadDropdownOpen]);

  useEffect(() => {
    if (!isUploadDropdownOpen) return;
    let cancelled = false;
    setPanelMessage(null);
    fetchUserUploadedSounds()
      .then((files) => { if (!cancelled) setUploadedFiles(files); })
      .catch(() => { if (!cancelled) setUploadedFiles([]); });
    return () => { cancelled = true; };
  }, [isUploadDropdownOpen]);

  const handleFileClick = () => {
    setUploadStatus('idle');
    setUploadMessage('');
    fileInputRef.current?.click();
  };

  const handleFolderClick = () => {
    setUploadStatus('idle');
    setUploadMessage('');
    folderInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';

    if (files.length === 0) return;

    const allowedFileTypes = /\.(wav|mp3|ogg|flac|m4a|aac)$/i;
    const allowedFiles = files.filter((f) => allowedFileTypes.test(f.name));

    setUploadStatus('uploading');
    setUploadMessage(`Processing ${allowedFiles.length} file(s)...`);

    const results = await Promise.allSettled(
      allowedFiles.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Failed');
      })
    );
    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const failCount = results.filter((r) => r.status === 'rejected').length;

    if (successCount > 0) {
      setUploadStatus('ok');
      setUploadMessage(`Added ${successCount} sound${successCount !== 1 ? 's' : ''}`);
      refreshGalaxy();
      fetchUserUploadedSounds().then(setUploadedFiles).catch(() => {});
    } else {
      setUploadStatus('error');
      setUploadMessage(failCount > 0 ? 'Upload failed' : 'No audio files found');
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteAllBuiltin = async () => {
    setDeleteError(null);
    try {
      const ids = await fetchAllBuiltinIds();
      if (ids.length === 0) {
        setConfirmAction(null);
        return;
      }
      const res = await fetch(`${API_BASE}/api/sounds/hide-builtin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Failed to hide built-in sounds');
      setConfirmAction(null);
      refreshGalaxy();
      setPanelMessage('All built-in sounds hidden');
      fetchUserUploadedSounds().then(setUploadedFiles).catch(() => {});
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to hide built-in sounds');
    }
  };

  const deleteAllUser = async () => {
    setDeleteError(null);
    try {
      const res = await fetch(`${API_BASE}/api/sounds/user/all`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete user sounds');
      setConfirmAction(null);
      refreshGalaxy();
      setUploadedFiles([]);
      setPanelMessage('All user sounds deleted');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete user sounds');
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleteError(null);
    const userIdsInt = [...selectedIds];
    try {
      const bulkRes = await fetch(`${API_BASE}/api/sounds/bulk`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: userIdsInt }),
      });
      if (!bulkRes.ok) throw new Error('Failed to delete user sounds');
      setSelectionMode(false);
      setSelectedIds(new Set());
      refreshGalaxy();
      fetchUserUploadedSounds().then(setUploadedFiles).catch(() => {});
      setPanelMessage(`Deleted ${userIdsInt.length} sound(s)`);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete selected sounds');
    }
  };

  const enterSelectionMode = () => {
    setSelectedIds(new Set());
    setSelectionMode(true);
  };

  return {
    fileInputRef,
    folderInputRef,
    uploadWrapRef,
    isUploadDropdownOpen,
    setIsUploadDropdownOpen,
    uploadedFiles,
    handleFileClick,
    handleFolderClick,
    handleFileChange,
    setHighlightedListAudioUrl,
    selectionMode,
    setSelectionMode,
    enterSelectionMode,
    selectedIds,
    toggleSelected,
    confirmAction,
    setConfirmAction,
    deleteError,
    setDeleteError,
    panelMessage,
    deleteAllBuiltin,
    deleteAllUser,
    deleteSelected,
  };
}

// UI components (pure presentational / layout)

function HiddenFileInputs({
  fileInputRef,
  folderInputRef,
  onFileChange,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  folderInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".wav,.mp3,.ogg,.flac,.m4a,.aac"
        className="settings-file-input"
        onChange={onFileChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        {...({ webkitdirectory: '', directory: '' } as any)}
        className="settings-file-input"
        onChange={onFileChange}
      />
    </>
  );
}

function UploadDropdown({
  uploadStatus,
  uploadedFiles,
  onFileClick,
  onFolderClick,
  onPlay,
  onHighlight,
  selectionMode,
  setSelectionMode,
  enterSelectionMode,
  selectedIds,
  toggleSelected,
  confirmAction,
  setConfirmAction,
  deleteError,
  setDeleteError,
  panelMessage,
  deleteAllBuiltin,
  deleteAllUser,
  deleteSelected,
}: {
  uploadStatus: UploadStatus;
  uploadedFiles: UploadedFile[];
  onFileClick: () => void;
  onFolderClick: () => void;
  onPlay: (url: string) => void;
  onHighlight: (url: string | null) => void;
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  enterSelectionMode: () => void;
  selectedIds: Set<number>;
  toggleSelected: (id: number) => void;
  confirmAction: ConfirmAction;
  setConfirmAction: (a: ConfirmAction) => void;
  deleteError: string | null;
  setDeleteError: (err: string | null) => void;
  panelMessage: string | null;
  deleteAllBuiltin: () => Promise<void>;
  deleteAllUser: () => Promise<void>;
  deleteSelected: () => Promise<void>;
}) {
  return (
    <div className="settings-upload-dropdown-wrapper">
      <div className="settings-uploaded-list-bridge" aria-hidden />
      <div className="settings-uploaded-list settings-uploaded-list--with-delete" role="tooltip">
        {panelMessage && (
          <p className="settings-upload-panel-message" role="status">{panelMessage}</p>
        )}
        {confirmAction !== null ? (
          <div className="settings-delete-confirm">
            <p className="settings-delete-confirm-text">
              {confirmAction === 'delete-all-builtin' &&
                'Hide all built-in sounds? You can restore them later.'}
              {confirmAction === 'delete-all-user' &&
                'Permanently delete all your uploaded sounds? This cannot be undone.'}
            </p>
            <div className="settings-action-row">
              <button
                type="button"
                className="settings-action-btn settings-action-btn--danger"
                onClick={() => (confirmAction === 'delete-all-builtin' ? deleteAllBuiltin() : deleteAllUser())}
              >
                Yes
              </button>
              <button
                type="button"
                className="settings-action-btn"
                onClick={() => { setConfirmAction(null); setDeleteError(null); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="settings-action-row">
              <button className="settings-action-btn" onClick={onFileClick} disabled={uploadStatus === 'uploading'}>
                <FileUp />
                <span>Upload files</span>
              </button>
              <button className="settings-action-btn" onClick={onFolderClick} disabled={uploadStatus === 'uploading'}>
                <FolderUp />
                <span>Upload folder</span>
              </button>
            </div>
            <span className="settings-uploaded-list-title">Uploaded sounds</span>
            {deleteError && <p className="settings-upload-error">{deleteError}</p>}
            {uploadedFiles.length === 0 ? (
              <span className="settings-uploaded-list-empty">No uploads yet</span>
            ) : (
              <ul className="settings-uploaded-list-names">
                {uploadedFiles.map((f) =>
                  selectionMode ? (
                    <li key={f.id}>
                      <label className="settings-delete-checkbox-row">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(f.id)}
                          onChange={() => toggleSelected(f.id)}
                          aria-label={`Select ${displayOnlySoundFileName(f.name)}`}
                        />
                        <span className="settings-delete-checkbox-name">{displayOnlySoundFileName(f.name)}</span>
                      </label>
                    </li>
                  ) : (
                    <li key={f.id}>
                      <button
                        type="button"
                        className="settings-uploaded-list-play"
                        onClick={(e) => {
                          e.preventDefault();
                          if (f.audioUrl) onPlay(f.audioUrl);
                        }}
                        onMouseEnter={() => onHighlight(f.audioUrl)}
                        onMouseLeave={() => onHighlight(null)}
                        title={`Play ${displayOnlySoundFileName(f.name)}`}
                        aria-label={`Play ${displayOnlySoundFileName(f.name)}`}
                      >
                        <Play size={14} aria-hidden />
                        <span>{displayOnlySoundFileName(f.name)}</span>
                      </button>
                    </li>
                  )
                )}
              </ul>
            )}
            <div className="settings-delete-section">
              <span className="settings-uploaded-list-title">Delete</span>
              <div className="settings-delete-buttons">
                <button
                  type="button"
                  className="settings-action-btn settings-action-btn--delete"
                  onClick={() => setConfirmAction('delete-all-builtin')}
                  disabled={uploadStatus === 'uploading'}
                  title="Hide all built-in sounds (reversible)"
                >
                  <Trash2 size={14} />
                  <span>Delete all built-in</span>
                </button>
                <button
                  type="button"
                  className="settings-action-btn settings-action-btn--delete"
                  onClick={() => setConfirmAction('delete-all-user')}
                  disabled={uploadStatus === 'uploading'}
                  title="Permanently delete all uploaded sounds"
                >
                  <Trash2 size={14} />
                  <span>Delete all user</span>
                </button>
                {selectionMode ? (
                  <div className="settings-delete-buttons-row">
                    <button
                      type="button"
                      className="settings-action-btn settings-action-btn--danger"
                      onClick={deleteSelected}
                      disabled={selectedIds.size === 0}
                    >
                      <Trash2 size={14} />
                      <span>Delete ({selectedIds.size})</span>
                    </button>
                    <button
                      type="button"
                      className="settings-action-btn"
                      onClick={() => setSelectionMode(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="settings-action-btn settings-action-btn--delete"
                    onClick={enterSelectionMode}
                    disabled={uploadStatus === 'uploading' || uploadedFiles.length === 0}
                    title="Select uploaded sounds to delete"
                  >
                    <ListChecks size={14} />
                    <span>Select to delete</span>
                  </button>
                )}
              </div>
              {deleteError && <p className="settings-upload-error">{deleteError}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function UploadPanel(props: UploadPanelProps) {
  const logic = useUploadPanelLogic(props);

  return (
    <>
      <HiddenFileInputs
        fileInputRef={logic.fileInputRef}
        folderInputRef={logic.folderInputRef}
        onFileChange={logic.handleFileChange}
      />
      <div className="settings-upload-wrap" ref={logic.uploadWrapRef}>
        <button
          type="button"
          className="settings-trigger"
          disabled={props.uploadStatus === 'uploading'}
          aria-label="Upload options"
          aria-expanded={logic.isUploadDropdownOpen}
          aria-haspopup="true"
          onClick={() => logic.setIsUploadDropdownOpen((open) => !open)}
        >
          <Upload size={22} aria-hidden />
        </button>
        {logic.isUploadDropdownOpen && (
          <UploadDropdown
            uploadStatus={props.uploadStatus}
            uploadedFiles={logic.uploadedFiles}
            onFileClick={logic.handleFileClick}
            onFolderClick={logic.handleFolderClick}
            onPlay={playAudioUrl}
            onHighlight={logic.setHighlightedListAudioUrl}
            selectionMode={logic.selectionMode}
            setSelectionMode={logic.setSelectionMode}
            enterSelectionMode={logic.enterSelectionMode}
            selectedIds={logic.selectedIds}
            toggleSelected={logic.toggleSelected}
            confirmAction={logic.confirmAction}
            setConfirmAction={logic.setConfirmAction}
            deleteError={logic.deleteError}
            setDeleteError={logic.setDeleteError}
            panelMessage={logic.panelMessage}
            deleteAllBuiltin={logic.deleteAllBuiltin}
            deleteAllUser={logic.deleteAllUser}
            deleteSelected={logic.deleteSelected}
          />
        )}
      </div>
    </>
  );
}
