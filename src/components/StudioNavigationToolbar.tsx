import { useId } from 'react';
import type { ViewportNavigationAction, ViewportNavigationState } from '../engine/viewportNavigation';
import './StudioNavigationToolbar.css';

export interface StudioNavigationToolbarProps {
  onNavigate: (action: ViewportNavigationAction) => void;
  state: ViewportNavigationState;
  disabled: boolean;
}

/** Native buttons keep the same camera actions available without canvas gestures. */
export function StudioNavigationToolbar({ onNavigate, state, disabled }: StudioNavigationToolbarProps) {
  const helpId = useId();
  const orthographic = state.projection === 'orthographic';
  const help = state.mode === 'fly'
    ? 'Fly: move the pointer over the canvas to look. Default keys: WASD to move, Space / Shift up and down. Scroll moves forward and back. Custom keybindings apply.'
    : state.mode === 'pan'
      ? 'Pan: drag the canvas to move the camera without building. Mouse wheel or trackpad scroll zooms. Choose Orbit to build again.'
      : orthographic
        ? 'Orthographic: drag to pan; click to use your building tool. Mouse wheel or trackpad scroll zooms. Choose Orbit to rotate in perspective.'
        : 'Orbit: drag to rotate; click to use your building tool. Choose Pan to move the camera without building. Mouse wheel or trackpad scroll zooms.';

  const actionButton = (action: ViewportNavigationAction, label: string, title: string, unavailable = false) => (
    <button type="button" className="studio-navigation__button" disabled={disabled || unavailable}
      onClick={() => onNavigate(action)} title={title}>{label}</button>
  );

  return <section className="studio-navigation" aria-label="Camera navigation" aria-describedby={helpId} data-viewport-input="blocked">
    <div className="studio-navigation__controls">
      <div className="studio-navigation__group" role="group" aria-label="Camera mode">
        <span className="studio-navigation__label">Camera</span>
        {(['orbit', 'pan', 'fly'] as const).map(mode => <button key={mode} type="button"
          className="studio-navigation__button" disabled={disabled}
          aria-pressed={state.mode === mode && (mode !== 'orbit' || !orthographic)}
          onClick={() => onNavigate(mode)}
          title={mode === 'orbit' ? 'Perspective orbit: drag to rotate, click to build' : mode === 'pan' ? 'Drag to move the camera without editing blocks' : 'Mouse look and keyboard flight; focuses the canvas'}>
          {mode === 'orbit' ? 'Orbit' : mode === 'pan' ? 'Pan' : 'Fly'}
        </button>)}
      </div>
      <div className="studio-navigation__group" role="group" aria-label="Frame and restore camera">
        {actionButton('frame-selection', 'Frame selection', 'Fit the selected region; requires both selection corners (Pos1 and Pos2)')}
        {actionButton('frame-all', 'Frame all', 'Fit all authored blocks, including blocks outside the current view')}
        {actionButton('home', 'Home', 'Restore the starting isometric camera')}
        {actionButton('previous', 'Previous', state.canGoBack ? 'Return to the previous saved camera view' : 'No previous camera view yet', !state.canGoBack)}
      </div>
      <div className="studio-navigation__group" role="group" aria-label="Orthographic views">
        <span className="studio-navigation__label">Views</span>
        {actionButton('top', 'Top', 'Frame all blocks from above in orthographic projection')}
        {actionButton('front', 'Front', 'Frame all blocks from the front in orthographic projection')}
        {actionButton('side', 'Side', 'Frame all blocks from the side in orthographic projection')}
      </div>
      <span className="studio-navigation__state" role="status">
        {orthographic ? 'Orthographic' : 'Perspective'}{disabled ? ' · Controls paused' : ''}
      </span>
    </div>
    <details className="studio-navigation__steps">
      <summary>Move camera without dragging</summary>
      <div className="studio-navigation__controls">
        <div className="studio-navigation__group" role="group" aria-label="Step pan">
          {actionButton('pan-left', 'Pan left', 'Move the camera and working point left by one screen-relative step')}
          {actionButton('pan-right', 'Pan right', 'Move the camera and working point right by one screen-relative step')}
          {actionButton('pan-up', 'Pan up', 'Move the camera and working point up by one screen-relative step')}
          {actionButton('pan-down', 'Pan down', 'Move the camera and working point down by one screen-relative step')}
        </div>
        <div className="studio-navigation__group" role="group" aria-label="Step orbit">
          {actionButton('orbit-left', 'Orbit left', 'Turn 15 degrees around the working point')}
          {actionButton('orbit-right', 'Orbit right', 'Turn 15 degrees around the working point')}
          {actionButton('orbit-up', 'Orbit up', 'Look from 15 degrees higher around the working point')}
          {actionButton('orbit-down', 'Orbit down', 'Look from 15 degrees lower around the working point')}
        </div>
        <div className="studio-navigation__group" role="group" aria-label="Step zoom">
          {actionButton('zoom-in', 'Zoom in', 'Move one step closer to the working point')}
          {actionButton('zoom-out', 'Zoom out', 'Move one step away from the working point')}
        </div>
      </div>
      <p>Each click or tap moves once. Previous restores the preceding view. These controls work in perspective and orthographic views.</p>
    </details>
    <p id={helpId} className="studio-navigation__help">{help}</p>
  </section>;
}
