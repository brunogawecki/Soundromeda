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

export function UploadPanel({ uploadStatus, setUploadStatus, setUploadMessage }: UploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadListHovered, setUploadListHovered] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const refreshGalaxy = useAppStore((s) => s.refreshGalaxy);
  const setHighlightedListAudioUrl = useAppStore((s) => s.setHighlightedListAudioUrl);

  useEffect(() => {
    if (!uploadListHovered) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/sounds?source=user`)
      .then((res) => (res.ok ? res.json() : { points: [] }))
      .then((data) => {
        const points = Array.isArray(data?.points) ? data.points : [];
        if (!cancelled) {
          setUploadedFiles(
            points.map((p: { name?: string; audioUrl?: string }) => ({
              name: p.name ?? 'Unknown',
              audioUrl: p.audioUrl ?? '',
            }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setUploadedFiles([]);
      });
    return () => {
      cancelled = true;
    };
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
    // Capture files into an array immediately. e.target.files is a live collection
    // that can be emptied if e.target.value is cleared.
    const fileList = e.target.files;
    const files = fileList ? Array.from(fileList) : [];

    // Clear input so same file can be selected again
    e.target.value = '';

    if (files.length === 0) return;

    setUploadStatus('uploading');
    setUploadMessage(`Processing ${files.length} file(s)...`);

    let successCount = 0;
    let failCount = 0;
    const allowedExts = /\.(wav|mp3|ogg|flac|m4a|aac)$/i;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Basic client-side filtering for folder uploads
      if (!allowedExts.test(file.name)) continue;

      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error('Failed');
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    if (successCount > 0) {
      setUploadStatus('ok');
      setUploadMessage(`Added ${successCount} sound${successCount !== 1 ? 's' : ''}`);
      refreshGalaxy();
    } else {
      setUploadStatus('error');
      setUploadMessage(failCount > 0 ? 'Upload failed' : 'No audio files found');
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".wav,.mp3,.ogg,.flac,.m4a,.aac"
        className="settings-file-input"
        onChange={handleFileChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        {...({ webkitdirectory: "", directory: "" } as any)}
        className="settings-file-input"
        onChange={handleFileChange}
      />
      <div
        className="settings-upload-wrap"
        onMouseEnter={() => setUploadListHovered(true)}
        onMouseLeave={() => setUploadListHovered(false)}
      >
        <button
          type="button"
          className="settings-trigger"
          disabled={uploadStatus === 'uploading'}
          aria-label="Upload options"
        >
          <Upload size={22} aria-hidden />
        </button>
        {uploadListHovered && (
          <>
            <div className="settings-uploaded-list-bridge" aria-hidden />
            <div className="settings-uploaded-list" role="tooltip">

              <div className="settings-action-row">
                <button className="settings-action-btn" onClick={handleFileClick} disabled={uploadStatus === 'uploading'}>
                  <FileUp />
                  <span>Upload files</span>
                </button>
                <button className="settings-action-btn" onClick={handleFolderClick} disabled={uploadStatus === 'uploading'}>
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
                          if (f.audioUrl) playAudioUrl(f.audioUrl);
                        }}
                        onMouseEnter={() => setHighlightedListAudioUrl(f.audioUrl)}
                        onMouseLeave={() => setHighlightedListAudioUrl(null)}
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
        )}
      </div>
    </>
  );
}
