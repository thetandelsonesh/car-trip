import type { Stop } from '../types';
import { STOP_TYPE_ICONS, STOP_TYPE_LABELS, STOP_WHEN_LABELS } from '../types';

interface Props {
  stops: Stop[];
  onRemove: (id: string) => void;
  returnToStart: boolean;
}

export default function StopsList({ stops, onRemove, returnToStart }: Props) {
  if (stops.length === 0) return null;

  const onTheWay = stops.filter((s) => s.when === 'on_the_way');
  const whileReturning = stops.filter((s) => s.when === 'while_returning');

  return (
    <div className="stops-list">
      <div className="stops-list-header">
        Stops ({stops.length})
      </div>

      {onTheWay.length > 0 && (
        <div className="stops-section">
          {returnToStart && <div className="stops-section-label">On the way</div>}
          {onTheWay.map((stop, i) => (
            <StopItem key={stop.id} stop={stop} index={i + 1} onRemove={onRemove} />
          ))}
        </div>
      )}

      {returnToStart && whileReturning.length > 0 && (
        <div className="stops-section">
          <div className="stops-section-label">While returning</div>
          {whileReturning.map((stop, i) => (
            <StopItem key={stop.id} stop={stop} index={onTheWay.length + i + 1} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

function StopItem({ stop, index, onRemove }: { stop: Stop; index: number; onRemove: (id: string) => void }) {
  return (
    <div className="stop-item">
      <div className="stop-item-number">{index}</div>
      <div className="stop-item-icon">{STOP_TYPE_ICONS[stop.stopType]}</div>
      <div className="stop-item-info">
        <div className="stop-item-name">{stop.name}</div>
        <div className="stop-item-meta">
          <span className="stop-badge">{STOP_TYPE_LABELS[stop.stopType]}</span>
        </div>
      </div>
      <button className="stop-item-remove" onClick={() => onRemove(stop.id)} title="Remove stop">
        ✕
      </button>
    </div>
  );
}
