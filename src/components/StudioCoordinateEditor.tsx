import { useState, type FormEvent } from 'react';
import type { GridCoord, SymmetryConfig, VolumeBrushConfig } from '../engine/types';
import type { StudioEditorResult } from '../lib/studioEditorSession';
import { StudioBuildToolOptions } from './StudioBuildToolOptions';

export type CoordinateAction = 'place' | 'erase' | 'paint' | 'pos1' | 'pos2' | 'brush_place' | 'brush_erase' | 'inspect';

/** A keyboard and single-pointer alternative to aiming or dragging in the canvas. */
export function StudioCoordinateEditor({ disabled, hasSelection, onClearSelection, onApply, brush, symmetry, javaLocked, onConfigure }: {
  disabled: boolean;
  hasSelection: boolean;
  onClearSelection: () => StudioEditorResult;
  onApply: (action: CoordinateAction, coordinate: GridCoord) => StudioEditorResult;
  brush: VolumeBrushConfig;
  symmetry: SymmetryConfig;
  javaLocked: boolean;
  onConfigure: (brush: VolumeBrushConfig, symmetry: SymmetryConfig) => void;
}) {
  const [values, setValues] = useState({ x: '0', y: '1', z: '0' });
  const [action, setAction] = useState<CoordinateAction>('place');
  const [message, setMessage] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const coordinate = { x: Number(values.x), y: Number(values.y), z: Number(values.z) };
    if (Object.values(values).some(value => !value.trim()) || Object.values(coordinate).some(value => !Number.isSafeInteger(value) || Math.abs(value) > 1_000_000)) {
      setMessage('Enter whole-number coordinates between −1,000,000 and 1,000,000.'); return;
    }
    const result = onApply(action, coordinate);
    setMessage(result.message ?? (result.status === 'applied' ? 'Applied. Undo restores the previous edit.' : result.status === 'noop' ? 'No change at this coordinate.' : 'The edit could not be applied.'));
  };
  return <details data-studio-coordinate-editor className="border-b border-slate-700 bg-slate-900 px-4 py-2 text-sm">
    <summary className="cursor-pointer py-1 font-medium">Coordinate tools</summary>
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-3" aria-label="Coordinate editor">
      {(['x', 'y', 'z'] as const).map(axis => <label key={axis} className="flex flex-col gap-1">
        <span>Coordinate {axis.toUpperCase()}</span>
        <input aria-label={`Coordinate ${axis.toUpperCase()}`} type="number" step="1" min="-1000000" max="1000000" required
          value={values[axis]} disabled={disabled} onChange={event => setValues(previous => ({ ...previous, [axis]: event.target.value }))}
          className="w-28 rounded border border-slate-600 bg-slate-950 px-2 py-2" />
      </label>)}
      <label className="flex flex-col gap-1"><span>Coordinate action</span>
        <select aria-label="Coordinate action" value={action} disabled={disabled} onChange={event => setAction(event.target.value as CoordinateAction)} className="rounded border border-slate-600 bg-slate-950 px-2 py-2">
          <option value="place">Place selected block</option><option value="erase">Erase</option><option value="paint">Paint</option>
          <option value="pos1">Set selection start</option><option value="pos2">Set selection end</option>
          <option value="brush_place">Place with volume brush</option><option value="brush_erase">Erase with volume brush</option>
          <option value="inspect">Inspect cell properties</option>
        </select>
      </label>
      <button type="submit" disabled={disabled} className="rounded bg-sky-700 px-4 py-2 disabled:opacity-50">Apply coordinate action</button>
      <button type="button" disabled={disabled || !hasSelection} onClick={() => {
        const result = onClearSelection();
        setMessage(result.message ?? (result.status === 'applied' ? 'Selection cleared. Undo restores the selection.' : result.status === 'noop' ? 'Selection is already clear.' : 'The selection could not be cleared.'));
      }} className="rounded border border-slate-500 px-4 py-2 disabled:opacity-50">Clear selection</button>
      <p role="status" className="basis-full text-slate-300">{message || 'Uses the active block, scale and symmetry settings. Navigation does not change these coordinates.'}</p>
    </form>
    <StudioBuildToolOptions brush={brush} symmetry={symmetry} disabled={disabled} javaLocked={javaLocked} onApply={onConfigure} />
  </details>;
}
