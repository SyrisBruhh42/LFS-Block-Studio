import { useEffect, useState, type FormEvent } from 'react';
import { getVolumeBrushError } from '../engine/chunkAndPatternEngine';
import { getSymmetryTargetsError } from '../engine/spatialCopilotEngine';
import type { SymmetryConfig, VolumeBrushConfig } from '../engine/types';

interface Props {
  brush: VolumeBrushConfig;
  symmetry: SymmetryConfig;
  disabled: boolean;
  javaLocked: boolean;
  onApply: (brush: VolumeBrushConfig, symmetry: SymmetryConfig) => void;
}
const draft = (brush: VolumeBrushConfig, symmetry: SymmetryConfig) => ({ brush: { ...brush }, symmetry: { ...symmetry }, x: String(symmetry.pivotX), z: String(symmetry.pivotZ) });

/** Numeric alternatives use the same live tool preferences as the canvas HUD. */
export function StudioBuildToolOptions({ brush, symmetry, disabled, javaLocked, onApply }: Props) {
  const source = JSON.stringify([brush, symmetry]);
  const [values, setValues] = useState(() => draft(brush, symmetry));
  const [dirty, setDirty] = useState(false), [draftSource, setDraftSource] = useState(source), [message, setMessage] = useState('');
  useEffect(() => {
    if (!dirty) { setValues(draft(brush, symmetry)); setDraftSource(source); }
  }, [source, dirty]);
  const change = (update: Partial<typeof values>) => {
    if (!dirty) setDraftSource(source);
    setDirty(true); setMessage(''); setValues(previous => ({ ...previous, ...update }));
  };
  const stale = dirty && draftSource !== source;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || stale) return;
    const nextSymmetry = { ...values.symmetry, pivotX: Number(values.x), pivotZ: Number(values.z) };
    const error = !values.x.trim() || !values.z.trim() ? 'Enter both mirror pivots.'
      : getVolumeBrushError(values.brush) || getSymmetryTargetsError({ x: 0, y: 0, z: 0 }, 0, nextSymmetry);
    if (error) { setMessage(error); return; }
    onApply({ ...values.brush }, nextSymmetry); setDirty(false);
    setMessage('Tool settings applied. Your build and Undo history are unchanged.');
  };
  const field = 'flex flex-col gap-1', control = 'min-h-11 rounded border border-slate-600 bg-slate-950 px-3 py-2';
  return <details className="mt-3 border-t border-slate-700 pt-2">
    <summary className="min-h-11 cursor-pointer py-2 font-medium">Brush and mirror settings</summary>
    <form aria-label="Brush and mirror settings" onSubmit={submit} className="max-h-[40vh] overflow-y-auto overscroll-contain p-1">
      <fieldset disabled={disabled} className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="sr-only">Build tool preferences</legend>
        <label className={field}>Brush shape<select aria-label="Brush shape" className={control} value={values.brush.shape} onChange={event => change({ brush: { ...values.brush, shape: event.target.value as VolumeBrushConfig['shape'] } })}>
          <option value="sphere">Sphere</option><option value="cube">Cube</option><option value="cylinder">Cylinder</option><option value="diamond">Diamond</option>
        </select></label>
        <label className={field}>Brush radius<select aria-label="Brush radius" className={control} value={values.brush.radius} onChange={event => change({ brush: { ...values.brush, radius: Number(event.target.value) } })}>
          {Array.from({ length: 9 }, (_, radius) => <option key={radius} value={radius}>{radius === 0 ? '0 · Single cell' : radius}</option>)}
        </select></label>
        <label className={field}>Cylinder height<select aria-label="Cylinder height" className={control} value={values.brush.height} onChange={event => change({ brush: { ...values.brush, height: Number(event.target.value) } })}>
          {Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
        </select></label>
        <label className={field}>Mirror mode<select aria-label="Mirror mode" className={control} value={values.symmetry.mode} onChange={event => change({ symmetry: { ...values.symmetry, mode: event.target.value as SymmetryConfig['mode'] } })}>
          <option value="off">Off</option><option value="mirror_x">Mirror X</option><option value="mirror_z">Mirror Z</option><option value="quad_xz">Four ways · X and Z</option>
        </select></label>
        <label className={field}>Mirror pivot X<input aria-label="Mirror pivot X" type="number" step="0.5" min="-1000000" max="1000000" required className={control} value={values.x} onChange={event => change({ x: event.target.value })} /></label>
        <label className={field}>Mirror pivot Z<input aria-label="Mirror pivot Z" type="number" step="0.5" min="-1000000" max="1000000" required className={control} value={values.z} onChange={event => change({ z: event.target.value })} /></label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={values.brush.hollow} onChange={event => change({ brush: { ...values.brush, hollow: event.target.checked } })} /> Hollow brush</label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={values.brush.airOnly} onChange={event => change({ brush: { ...values.brush, airOnly: event.target.checked } })} /> Place in empty cells only</label>
      </fieldset>
      <p className="my-3 text-slate-300">Pivots use whole or half cells. Brush placement reveals changed chunks; overlapping brush cells count once. Radius zero affects one cell per mirror target.</p>
      {javaLocked && <p className="my-3 text-slate-300">This Java candidate mirrors full block cells without changing their native block state. Its mapped states have no directional properties.</p>}
      {stale && <p role="alert">These settings changed elsewhere. Keep your draft or reload current tool settings before applying.</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={disabled || stale} className="min-h-11 rounded bg-sky-700 px-4 py-2 disabled:opacity-50">Apply tool settings</button>
        <button type="button" disabled={disabled} className="min-h-11 rounded border border-slate-600 px-4 py-2" onClick={() => { setValues(draft(brush, symmetry)); setDirty(false); setDraftSource(source); setMessage('Current tool settings loaded.'); }}>Reload current tool settings</button>
      </div>
      <p role="status" className="mt-2">{message}</p>
    </form>
  </details>;
}
