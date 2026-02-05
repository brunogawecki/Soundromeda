import { useState, useRef, useEffect } from 'react';
import { Upload, Play, FileUp, FolderUp } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { playAudioUrl } from '../useTone';

const API_BASE = '';

interface UploadedFile {
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
  return points.map((point: { name?: string; audioUrl?: string }) => ({
    name: point.name ?? 'Unknown',
    audioUrl: point.audioUrl ?? '',
  }));
}

function useUploadPanelLogic({ setUploadStatus, setUploadMessage }: UploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadListHovered, setUploadListHovered] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const refreshGalaxy = useAppStore((s) => s.refreshGalaxy);
  const setHighlightedListAudioUrl = useAppStore((s) => s.setHighlightedListAudioUrl);

  useEffect(() => {
    if (!uploadListHovered) return;
    let cancelled = false;
    fetchUserUploadedSounds()
      .then((files) => { if (!cancelled) setUploadedFiles(files); })
      .catch(() => { if (!cancelled) setUploadedFiles([]); });
    return () => { cancelled = true; };
  }, [uploadListHovered]);

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
    } else {
      setUploadStatus('error');
      setUploadMessage(failCount > 0 ? 'Upload failed' : 'No audio files found');
    }
  };

  return {
    fileInputRef,
    folderInputRef,
    uploadListHovered,
    setUploadListHovered,
    uploadedFiles,
    handleFileClick,
    handleFolderClick,
    handleFileChange,
    setHighlightedListAudioUrl,
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
}: {
  uploadStatus: UploadStatus;
  uploadedFiles: UploadedFile[];
  onFileClick: () => void;
  onFolderClick: () => void;
  onPlay: (url: string) => void;
  onHighlight: (url: string | null) => void;
}) {
  return (
    <>
      <div className="settings-uploaded-list-bridge" aria-hidden />
      <div className="settings-uploaded-list" role="tooltip">
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
        {uploadedFiles.length === 0 ? (
          <span className="settings-uploaded-list-empty">No uploads yet</span>
        ) : (
          <ul className="settings-uploaded-list-names">
            {uploadedFiles.map((f, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="settings-uploaded-list-play"
                  onClick={(e) => {
                    e.preventDefault();
                    if (f.audioUrl) onPlay(f.audioUrl);
                  }}
                  onMouseEnter={() => onHighlight(f.audioUrl)}
                  onMouseLeave={() => onHighlight(null)}
                  title={`Play ${f.name}`}
                  aria-label={`Play ${f.name}`}
                >
                  <Play size={14} aria-hidden />
                  <span>{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
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
      <div
        className="settings-upload-wrap"
        onMouseEnter={() => logic.setUploadListHovered(true)}
        onMouseLeave={() => logic.setUploadListHovered(false)}
      >
        <button
          type="button"
          className="settings-trigger"
          disabled={props.uploadStatus === 'uploading'}
          aria-label="Upload options"
        >
          <Upload size={22} aria-hidden />
        </button>
        {logic.uploadListHovered && (
          <UploadDropdown
            uploadStatus={props.uploadStatus}
            uploadedFiles={logic.uploadedFiles}
            onFileClick={logic.handleFileClick}
            onFolderClick={logic.handleFolderClick}
            onPlay={playAudioUrl}
            onHighlight={logic.setHighlightedListAudioUrl}
          />
        )}
      </div>
    </>
  );
}
