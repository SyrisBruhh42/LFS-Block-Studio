import React from 'react';

export interface SolarpunkIconProps {
  iconId: string;
  size?: number;
  className?: string;
  strokeHex?: string;
  fillHex?: string;
  preserveSrEmoji?: string;
  title?: string;
}

const SOLARPUNK_VECTOR_PATHS: Record<string, { stroke: string; fill: string }> = {
  'sp.nav.home_hearth': {
    stroke: 'M 3 11 L 12 3 L 21 11 V 20 A 1 1 0 0 1 20 21 H 4 A 1 1 0 0 1 3 20 Z M 9 21 V 14 A 3 3 0 0 1 15 14 V 21',
    fill: 'M 12 7 C 14 9 14 11 12 12 C 10 11 10 9 12 7 Z',
  },
  'sp.nav.apps_canopy': {
    stroke: 'M 4 4 H 10 V 10 H 4 Z M 14 4 H 20 V 10 H 14 Z M 4 14 H 10 V 20 H 4 Z M 17 14 C 19 14 21 16 21 18 C 21 20 19 21 17 21 C 15 21 13 20 13 18 C 13 16 15 14 17 14 Z',
    fill: 'M 5 5 H 9 V 9 H 5 Z M 17 15 C 18.5 15 19.5 16.5 19.5 18 C 19.5 19.5 18.5 20 17 20 Z',
  },
  'sp.nav.saves_vault': {
    stroke: 'M 5 4 H 17 L 20 7 V 19 A 1 1 0 0 1 19 20 H 5 A 1 1 0 0 1 4 19 V 5 A 1 1 0 0 1 5 4 Z M 8 4 V 9 H 15 V 4 M 12 12 V 17 M 9.5 14.5 L 12 17 L 14.5 14.5',
    fill: 'M 8 12 A 4 4 0 1 0 16 12 A 4 4 0 1 0 8 12 Z',
  },
  'sp.nav.calm_sanctuary': {
    stroke: 'M 12 4 C 14 8 18 10 20 14 C 17 17 14 19 12 19 C 10 19 7 17 4 14 C 6 10 10 8 12 4 Z M 4 21 C 8 19 16 19 20 21',
    fill: 'M 12 7 C 13.5 10 16 12 17 14 C 15 16 13.5 17 12 17 C 10.5 17 9 16 7 14 C 8 12 10.5 10 12 7 Z',
  },
  'sp.nav.help_lantern': {
    stroke: 'M 9 4 H 15 M 10 4 L 8 8 V 17 L 10 20 H 14 L 16 17 V 8 L 14 4 M 12 10 C 13.5 11.5 13.5 14 12 15.5 C 10.5 14 10.5 11.5 12 10 Z',
    fill: 'M 12 10 C 13.5 11.5 13.5 14 12 15.5 C 10.5 14 10.5 11.5 12 10 Z',
  },
  'sp.nav.command_astrolabe': {
    stroke: 'M 12 3 A 9 9 0 1 0 21 12 A 9 9 0 1 0 12 3 Z M 12 7 L 14 12 L 12 17 L 10 12 Z M 7 12 H 17',
    fill: 'M 12 7 L 14 12 L 12 17 L 10 12 Z',
  },
  'sp.nav.companion_willow': {
    stroke: 'M 6 17 C 6 11 11 6 18 6 C 18 13 13 18 6 17 Z M 6 17 L 4 20 M 10 14 L 15 9',
    fill: 'M 8 15 C 8 11 12 8 16 8 C 16 12 12 15 8 15 Z',
  },
  'sp.nav.games_arcade': {
    stroke: 'M 5 8 H 19 A 2 2 0 0 1 21 10 V 17 A 2 2 0 0 1 19 19 H 5 A 2 2 0 0 1 3 17 V 10 A 2 2 0 0 1 5 8 Z M 8 11 V 16 M 5.5 13.5 H 10.5 M 15.5 12.5 H 16.5 M 17.5 14.5 H 18.5',
    fill: 'M 5 10 H 19 V 17 H 5 Z',
  },
  'sp.act.new_seed': {
    stroke: 'M 12 21 V 11 M 12 14 C 8 14 6 11 6 7 C 10 7 12 10 12 14 Z M 12 12 C 16 12 18 9 18 5 C 14 5 12 8 12 12 Z M 7 21 H 17',
    fill: 'M 12 14 C 8 14 6 11 6 7 C 10 7 12 10 12 14 Z M 12 12 C 16 12 18 9 18 5 C 14 5 12 8 12 12 Z',
  },
  'sp.sec.shield_aegis': {
    stroke: 'M 12 3 L 19 6 V 11 C 19 16 15.5 19.5 12 21 C 8.5 19.5 5 16 5 11 V 6 Z M 12 7 V 17 M 9 11 L 12 8 L 15 11',
    fill: 'M 12 5 L 17 7.2 V 11 C 17 14.8 14.5 17.5 12 18.8 C 9.5 17.5 7 14.8 7 11 V 7.2 Z',
  },
  'sp.sec.lock_step_up': {
    stroke: 'M 6 11 H 18 A 1 1 0 0 1 19 12 V 19 A 1 1 0 0 1 18 20 H 6 A 1 1 0 0 1 5 19 V 12 A 1 1 0 0 1 6 11 Z M 8 11 V 7 A 4 4 0 0 1 16 7 V 11 M 12 14 V 17',
    fill: 'M 7 13 H 17 V 18 H 7 Z',
  },
  'sp.sec.abac_node': {
    stroke: 'M 12 3 L 20 7.5 V 16.5 L 12 21 L 4 16.5 V 7.5 Z M 12 8 A 4 4 0 1 0 16 12 A 4 4 0 1 0 12 8 Z',
    fill: 'M 12 8 A 4 4 0 1 0 16 12 A 4 4 0 1 0 12 8 Z',
  },
  'sp.sec.cookie_dividend': {
    stroke: 'M 12 3 L 19 10 L 12 21 L 5 10 Z M 5 10 H 19 M 12 3 L 9 10 L 12 21 L 15 10 Z',
    fill: 'M 12 5 L 17 10 L 12 19 L 7 10 Z',
  },
  'sp.sec.anomaly_ward': {
    stroke: 'M 12 3 L 20 7 V 13 C 20 17.5 16.5 20.5 12 22 C 7.5 20.5 4 17.5 4 13 V 7 Z M 8 12 C 10 9.5 14 9.5 16 12 C 14 14.5 10 14.5 8 12 Z M 12 11.5 A 0.5 0.5 0 1 0 12.5 12',
    fill: 'M 8 12 C 10 9.5 14 9.5 16 12 C 14 14.5 10 14.5 8 12 Z',
  },
  'sp.telem.gpu_vram': {
    stroke: 'M 4 7 H 20 V 17 H 4 Z M 8 10 H 11 V 14 H 8 Z M 13 10 H 16 V 14 H 13 Z M 7 4 V 7 M 12 4 V 7 M 17 4 V 7 M 7 17 V 20 M 12 17 V 20 M 17 17 V 20',
    fill: 'M 8 10 H 11 V 14 H 8 Z M 13 10 H 16 V 14 H 13 Z',
  },
  'sp.well.flux_sun': {
    stroke: 'M 12 7 A 5 5 0 1 0 17 12 A 5 5 0 1 0 12 7 Z M 12 2 V 4 M 12 20 V 22 M 2 12 H 4 M 20 12 H 22 M 5 5 L 6.5 6.5 M 17.5 17.5 L 19 19 M 19 5 L 17.5 6.5 M 6.5 17.5 L 5 19',
    fill: 'M 12 8 A 4 4 0 1 0 16 12 A 4 4 0 1 0 12 8 Z',
  },
  'sp.well.sound_rain': {
    stroke: 'M 7 14 A 4 4 0 0 1 7 6 A 5 5 0 0 1 17 7 A 3.5 3.5 0 0 1 18 14 Z M 8 17 L 7 20 M 12 17 L 11 20 M 16 17 L 15 20',
    fill: 'M 7 13 H 17 A 2.5 2.5 0 0 0 16 8 A 4 4 0 0 0 8 7 A 3 3 0 0 0 7 13 Z',
  },
  'sp.game.gratitude_hall': {
    stroke: 'M 3 10 L 12 4 L 21 10 M 5 10 V 19 M 9 10 V 19 M 15 10 V 19 M 19 10 V 19 M 3 19 H 21',
    fill: 'M 6 6.5 L 12 3 L 18 6.5 Z',
  },
};

export function SolarpunkIcon({
  iconId,
  size = 18,
  className = '',
  strokeHex = 'var(--lds-color-accent-secondary, #E8B954)',
  fillHex = 'var(--lds-color-accent-primary, #7ED9A8)',
  preserveSrEmoji,
  title,
}: SolarpunkIconProps) {
  const entry = SOLARPUNK_VECTOR_PATHS[iconId] ?? SOLARPUNK_VECTOR_PATHS['sp.sec.abac_node'];
  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`} title={title}>
      {preserveSrEmoji ? <span className="sr-only">{preserveSrEmoji}</span> : null}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        aria-hidden="true"
      >
        <path d={entry.fill} fill={fillHex} fillOpacity={0.22} />
        <path
          d={entry.stroke}
          stroke={strokeHex}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
export default SolarpunkIcon;
