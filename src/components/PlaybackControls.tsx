import { useRef, useCallback } from 'react';
import { formatDuration } from '../utils/route';

interface Props {
  isPlaying: boolean;
  progress: number;
  speed: number;
  totalDuration: number;
  onPlayPause: () => void;
  onSeek: (progress: number) => void;
  onSpeedChange: (speed: number) => void;
}

const SPEEDS = [1, 3, 6, 10];

export default function PlaybackControls({
  isPlaying,
  progress,
  speed,
  totalDuration,
  onPlayPause,
  onSeek,
  onSpeedChange,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      onSeek(Math.min(Math.max(x, 0), 1));
    },
    [onSeek]
  );

  const elapsed = totalDuration * progress;

  return (
    <div className="playback-controls">
      <button className="play-btn" onClick={onPlayPause}>
        {isPlaying ? (
          <svg viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <polygon points="6,4 20,12 6,20" />
          </svg>
        )}
      </button>

      <div className="timeline">
        <div className="timeline-bar" ref={barRef} onClick={handleBarClick}>
          <div
            className="timeline-progress"
            style={{ width: `${progress * 100}%` }}
          />
          <div
            className="timeline-thumb"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <div className="timeline-labels">
          <span>{formatDuration(elapsed)}</span>
          <span>{formatDuration(totalDuration)}</span>
        </div>
      </div>

      <div className="speed-controls">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`speed-btn ${speed === s ? 'active' : ''}`}
            onClick={() => onSpeedChange(s)}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
