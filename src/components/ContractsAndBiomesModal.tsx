import React, { useMemo, useState } from 'react';
import { CustomBlockDefinition, PlacedBlock } from '../engine/types';
import {
  ARCHITECTURAL_CONTRACTS,
  ATMOSPHERE_PRESETS,
  AtmospherePresetId,
  PROCEDURAL_BIOME_TEMPLATES,
  ProceduralBiomeId,
  computeMasteryRank,
  evaluateAllContracts,
  getDailyBuildPromptForDate,
} from '../engine/studioEngagementEngine';
import { DraggableWindow } from './DraggableWindow';
import {
  Award,
  CheckCircle2,
  Compass,
  Flame,
  HelpCircle,
  Mountain,
  Play,
  Sparkles,
  Sun,
  Trophy,
  X,
} from 'lucide-react';

interface ContractsAndBiomesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'contracts' | 'biomes' | 'daily';
  blocks: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
  userXp: number;
  claimedContractIds: string[];
  claimedDailyDates: string[];
  streakDays: number;
  onClaimContractReward: (contractId: string, xpReward: number) => void;
  onClaimDailyPromptReward: (dateKey: string, bonusXp: number) => void;
  onGenerateProceduralBiome: (
    biomeId: ProceduralBiomeId,
    syncAtmosphere: boolean
  ) => void;
  onSelectAtmospherePreset: (presetId: AtmospherePresetId) => void;
  onSelectBlockId: (blockId: string) => void;
  onLaunchOnboardingTour: () => void;
}

export const ContractsAndBiomesModal: React.FC<
  ContractsAndBiomesModalProps
> = ({
  isOpen,
  onClose,
  initialTab = 'contracts',
  blocks,
  customBlocks,
  userXp,
  claimedContractIds,
  claimedDailyDates,
  streakDays,
  onClaimContractReward,
  onClaimDailyPromptReward,
  onGenerateProceduralBiome,
  onSelectAtmospherePreset,
  onSelectBlockId,
  onLaunchOnboardingTour,
}) => {
  const [activeTab, setActiveTab] = useState<'contracts' | 'biomes' | 'daily'>(
    initialTab
  );
  const [syncBiomeAtmosphere, setSyncBiomeAtmosphere] = useState<boolean>(true);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const evaluations = useMemo(
    () => evaluateAllContracts(blocks, customBlocks),
    [blocks, customBlocks]
  );

  const mastery = useMemo(() => computeMasteryRank(userXp), [userXp]);
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const dailyPrompt = useMemo(
    () => getDailyBuildPromptForDate(todayKey),
    [todayKey]
  );
  const isDailyClaimed = claimedDailyDates.includes(todayKey);

  if (!isOpen) return null;

  const totalBlocks = Object.keys(blocks).length;

  return (
    <DraggableWindow
      windowId="contracts_biomes_window"
      title="Studio Progression, Biomes & Architectural Contracts"
      subtitle={`${mastery.currentRank.title} · ${userXp} XP`}
      defaultWidth={980}
      defaultHeight={680}
      minWidth={350}
      minHeight={300}
      onClose={onClose}
      testId="contracts-and-biomes-modal"
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Compact Mastery Rank & Streak Progress Banner */}
        <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-950 font-black text-xs shadow"
              style={{ backgroundColor: mastery.currentRank.badgeHex }}
            >
              L{mastery.currentRank.level}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-mono font-bold text-slate-950"
                  style={{ backgroundColor: mastery.currentRank.badgeHex }}
                >
                  {mastery.currentRank.title}
                </span>
                <span className="text-xs text-slate-300 hidden sm:inline">
                  {mastery.currentRank.perkDescription}
                </span>
              </div>
            </div>
          </div>

          {/* Right: XP Bar & Streak Counter */}
          <div className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
            <div className="flex items-center gap-1 text-amber-400 text-xs font-mono font-bold">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>{streakDays}d Streak</span>
            </div>
            <div className="h-3.5 w-px bg-slate-800" />
            <div className="w-32">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-amber-300 font-bold">{userXp} XP</span>
                <span className="text-slate-400">
                  {mastery.nextRank
                    ? `Next: ${mastery.nextRank.minXp} XP`
                    : 'Max Rank'}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-0.5">
                <div
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${mastery.progressToNextPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Strip */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="tab-architectural-contracts"
              onClick={() => setActiveTab('contracts')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                activeTab === 'contracts'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>
                Architectural Contracts ({claimedContractIds.length}/
                {ARCHITECTURAL_CONTRACTS.length})
              </span>
            </button>

            <button
              type="button"
              data-testid="tab-procedural-biomes"
              onClick={() => setActiveTab('biomes')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                activeTab === 'biomes'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Mountain className="w-3.5 h-3.5" />
              <span>
                Procedural Island Biomes ({PROCEDURAL_BIOME_TEMPLATES.length})
              </span>
            </button>

            <button
              type="button"
              data-testid="tab-daily-prompt-tour"
              onClick={() => setActiveTab('daily')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                activeTab === 'daily'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Daily Build Challenge & Studio Tour</span>
            </button>
          </div>

          {statusToast && (
            <span className="text-xs font-mono text-emerald-400">
              {statusToast}
            </span>
          )}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'contracts' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-300">
                  Live Spatial Evaluator automatically inspects your active
                  world (<strong className="text-amber-300">{totalBlocks} blocks</strong>)
                  for elevation, footprint span, material diversity, symmetry,
                  slopes, and lighting.
                </p>
                <span className="text-[11px] font-mono text-emerald-400">
                  Real-Time CAD Evaluation Active
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {ARCHITECTURAL_CONTRACTS.map((contract) => {
                  const ev = evaluations[contract.id];
                  const isClaimed = claimedContractIds.includes(contract.id);
                  const canClaim = ev?.isCompleted && !isClaimed;

                  return (
                    <div
                      key={contract.id}
                      data-testid={`contract-card-${contract.id}`}
                      className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition-colors ${
                        isClaimed
                          ? 'bg-slate-950/90 border-emerald-500/40'
                          : canClaim
                          ? 'bg-slate-950 border-amber-400 shadow-lg'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-cyan-300 uppercase">
                            {contract.category} · {contract.difficulty}
                          </span>
                          <span className="text-xs font-mono font-bold text-amber-400">
                            +{contract.xpReward} XP
                          </span>
                        </div>

                        <h3 className="text-sm font-bold text-slate-100">
                          {contract.title}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {contract.description}
                        </p>

                        {/* Criterion Check Bars */}
                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                          {ev?.checks.map((chk) => (
                            <div
                              key={chk.label}
                              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center justify-between ${
                                chk.met
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                  : 'bg-slate-900 border-slate-800 text-slate-400'
                              }`}
                            >
                              <span className="truncate mr-1">{chk.label}</span>
                              <span className="font-bold shrink-0">
                                {chk.current}/{chk.target}
                                {chk.unit === '%' ? '%' : ''}
                              </span>
                            </div>
                          ))}
                        </div>

                        <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                          <strong>Tip:</strong> {contract.architecturalTip}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                        <div className="flex items-center gap-1 flex-wrap">
                          {contract.recommendedBlocks.map((bId) => (
                            <button
                              key={bId}
                              type="button"
                              onClick={() => {
                                onSelectBlockId(bId);
                                setStatusToast(`Equipped ${bId} in brush.`);
                              }}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300"
                              title="Click to equip block"
                            >
                              {customBlocks[bId]?.name || bId}
                            </button>
                          ))}
                        </div>

                        {isClaimed ? (
                          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Completed</span>
                          </span>
                        ) : canClaim ? (
                          <button
                            type="button"
                            data-testid={`claim-contract-${contract.id}`}
                            onClick={() => {
                              onClaimContractReward(
                                contract.id,
                                contract.xpReward
                              );
                              setStatusToast(
                                `Claimed +${contract.xpReward} XP for "${contract.title}"!`
                              );
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 shadow shrink-0"
                          >
                            <Award className="w-3.5 h-3.5" />
                            <span>Claim +{contract.xpReward} XP</span>
                          </button>
                        ) : (
                          <span className="text-xs font-mono text-slate-400 shrink-0">
                            {ev?.overallProgressPercent || 0}% Ready
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'biomes' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Procedural Island Biome & Terrain Generator (Undo-Safe)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Generate a rich multi-material island foundation in one tap.
                    Automatically saves an Undo snapshot first.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncBiomeAtmosphere}
                    onChange={(e) => setSyncBiomeAtmosphere(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>Sync Atmosphere & Lighting with Biome</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {PROCEDURAL_BIOME_TEMPLATES.map((biome) => (
                  <div
                    key={biome.id}
                    data-testid={`biome-card-${biome.id}`}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-slate-950"
                          style={{ backgroundColor: biome.accentHex }}
                        >
                          {biome.badge}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Lighting: {biome.recommendedAtmosphere}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-slate-100">
                        {biome.name}
                      </h4>
                      <p className="text-[11px] font-medium text-amber-300/90">
                        {biome.subtitle}
                      </p>
                      <p className="text-xs text-slate-400">
                        {biome.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      data-testid={`generate-biome-${biome.id}`}
                      onClick={() => {
                        onGenerateProceduralBiome(
                          biome.id,
                          syncBiomeAtmosphere
                        );
                        setStatusToast(`Generated "${biome.name}" island!`);
                        onClose();
                      }}
                      className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Generate Biome World</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Atmosphere & Time-of-Day Studio Presets */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5" />
                    <span>Instant Atmosphere & Solar Lighting Presets</span>
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  {ATMOSPHERE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`modal-atmosphere-${preset.id}`}
                      onClick={() => {
                        onSelectAtmospherePreset(preset.id);
                        setStatusToast(`Applied "${preset.name}" atmosphere.`);
                      }}
                      className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-400/50 text-left transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: preset.badgeColor }}
                        />
                        <span className="text-xs font-bold text-slate-100 truncate">
                          {preset.name}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                        {preset.tagline}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'daily' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left 7 cols: Daily Build Challenge */}
              <div className="lg:col-span-7 p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold">
                    Daily Challenge · {todayKey}
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-400">
                    +{dailyPrompt.bonusXp} Bonus XP
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-100">
                    {dailyPrompt.title}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {dailyPrompt.brief}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="text-[11px] font-mono text-slate-400">
                    Recommended Starter Biome:{' '}
                    <strong className="text-emerald-300">
                      {dailyPrompt.suggestedBiomeId}
                    </strong>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 mr-1">
                      Suggested Palette:
                    </span>
                    {dailyPrompt.suggestedBlocks.map((bId) => (
                      <button
                        key={bId}
                        type="button"
                        onClick={() => onSelectBlockId(bId)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-amber-300"
                      >
                        {customBlocks[bId]?.name || bId}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onGenerateProceduralBiome(
                        dailyPrompt.suggestedBiomeId,
                        true
                      );
                      onClose();
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                  >
                    <Mountain className="w-3.5 h-3.5" />
                    <span>Load Suggested Biome & Start</span>
                  </button>

                  {isDailyClaimed ? (
                    <span className="px-3.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Daily Bonus Claimed</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-testid="claim-daily-prompt-btn"
                      disabled={totalBlocks < 65}
                      onClick={() => {
                        onClaimDailyPromptReward(todayKey, dailyPrompt.bonusXp);
                        setStatusToast(
                          `Claimed +${dailyPrompt.bonusXp} Daily Challenge XP!`
                        );
                      }}
                      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>
                        {totalBlocks >= 65
                          ? `Complete & Claim +${dailyPrompt.bonusXp} XP`
                          : `Place ${Math.max(0, 65 - totalBlocks)} More Blocks to Claim`}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Right 5 cols: Interactive Onboarding Tour & Studio Quick Guide */}
              <div className="lg:col-span-5 p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                    <Compass className="w-4 h-4" />
                    <span>Interactive 4-Step Studio Tour</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">
                    Master Snap-Building, Copilot Ghosts, Symmetry & WorldEdit
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Launch the interactive spotlight guide at any time to walk
                    through block placement, Shift+Scroll scaling, Tab ghost
                    auto-complete, and WorldEdit region commands.
                  </p>
                </div>

                <button
                  type="button"
                  data-testid="launch-interactive-tour-btn"
                  onClick={() => {
                    onClose();
                    onLaunchOnboardingTour();
                  }}
                  className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Launch 4-Step Interactive Tour</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};
