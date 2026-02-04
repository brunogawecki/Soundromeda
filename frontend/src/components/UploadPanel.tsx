import { useState, useRef, useEffect } from 'react';
import { Upload, Play } from 'lucide-react';
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
  const [uploadListHovered, setUploadListHovered] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const refreshGalaxy = useAppStore((s) => s.refreshGalaxy);

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
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".wav,.mp3,.ogg,.flac,.m4a,.aac"
        className="settings-file-input"
        aria-label="Choose audio file"
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
          onClick={handleUploadClick}
          disabled={uploadStatus === 'uploading'}
          aria-label={uploadStatus === 'uploading' ? 'Uploading…' : 'Upload sound'}
        >
          <Upload size={22} aria-hidden />
        </button>
        {uploadListHovered && (
          <div className="settings-uploaded-list" role="tooltip">
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
        )}
      </div>
    </>
  );
}
