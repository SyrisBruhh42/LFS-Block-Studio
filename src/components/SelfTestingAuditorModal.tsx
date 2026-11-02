import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Bug,
  Sparkles,
  Play,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Circle,
  Square,
  Pencil,
  MapPin,
  Undo2,
  Trash2,
  Download,
  Upload,
  Copy,
  Check,
  Cpu,
  LayoutGrid,
  FileCode2,
  RefreshCw,
} from 'lucide-react';
import { DraggableWindow } from './DraggableWindow';
import {
  runAllSelfTests,
  SelfTestSuiteReport,
} from '../engine/selfTestSuite';
import {
  TrackedStudioIssue,
  NormalizedAnnotationRegion,
  StudioTelemetrySnapshot,
  GeminiIssueAnalysis,
  loadTrackedIssuesSync,
  saveTrackedIssues,
  upsertTrackedIssue,
  syncSelfTestReportToIssueTracker,
  analyzeIssueWithGeminiVision,
  runLiveDomAndErgonomicsAudit,
  LiveDomErgonomicsReport,
  generateAiStudioMasterFixPrompt,
  IssueStatus,
} from '../engine/issueTrackerEngine';
import {
  captureViewportDiagnosticFrame,
  getViewportRenderTelemetry,
  runLiveViewportGpuRebuildStressTest,
} from './SkyblockViewport';

export type AuditorModalTab =
  | 'self_tests'
  | 'visual_bug_reporter'
  | 'issue_tracker'
  | 'prompt_generator';

interface SelfTestingAuditorModalProps {
  isOpen: boolean;
  initialTab?: AuditorModalTab;
  onClose: () => void;
  activeBlockCount: number;
  unlockedChunksCount: number;
  activeToolMode: string;
  activeBlockId: string;
  lastCommands: string[];
  openWindows: string[];
  onIssuesChanged?: (issues: TrackedStudioIssue[]) => void;
}

export const SelfTestingAuditorModal: React.FC<SelfTestingAuditorModalProps> = ({
  isOpen,
  initialTab = 'self_tests',
  onClose,
  activeBlockCount,
  unlockedChunksCount,
  activeToolMode,
  activeBlockId,
  lastCommands,
  openWindows,
  onIssuesChanged,
}) => {
  const [activeTab, setActiveTab] = useState<AuditorModalTab>(initialTab);
  const [suiteReport, setSuiteReport] = useState<SelfTestSuiteReport | null>(
    null
  );
  const [issues, setIssues] = useState<TrackedStudioIssue[]>(() =>
    loadTrackedIssuesSync()
  );
  const [gpuStressResult, setGpuStressResult] = useState<{
    iterations: number;
    geometriesBefore: number;
    geometriesAfter: number;
    deltaGeometries: number;
    passed: boolean;
    durationMs: number;
  } | null>(null);
  const [domAuditResult, setDomAuditResult] =
    useState<LiveDomErgonomicsReport | null>(null);

  // Visual Bug Reporter Canvas & Annotation State
  const [capturedFrameUrl, setCapturedFrameUrl] = useState<string>('');
  const [annotations, setAnnotations] = useState<NormalizedAnnotationRegion[]>(
    []
  );
  const [drawTool, setDrawTool] = useState<
    'circle' | 'box' | 'freehand' | 'pin'
  >('circle');
  const [userDescription, setUserDescription] = useState<string>('');
  const [isAnalyzingVision, setIsAnalyzingVision] = useState<boolean>(false);
  const [latestVisionAnalysis, setLatestVisionAnalysis] =
    useState<GeminiIssueAnalysis | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Issue Tracker Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [includeFixedInMasterPrompt, setIncludeFixedInMasterPrompt] =
    useState<boolean>(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const freehandPointsRef = useRef<{ x: number; y: number }[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const fileImportRef = useRef<HTMLInputElement | null>(null);

  const collectTelemetry = (): StudioTelemetrySnapshot => {
    const gpu = getViewportRenderTelemetry();
    return {
      capturedAtIso: new Date().toISOString(),
      activeBlockCount,
      unlockedChunksCount,
      activeToolMode,
      activeBlockId,
      webglGeometries: gpu.geometries,
      webglTextures: gpu.textures,
      webglDrawCalls: gpu.calls,
      webglTriangles: gpu.triangles,
      windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1440,
      windowHeight: typeof window !== 'undefined' ? window.innerHeight : 900,
      lastCommands: lastCommands.slice(-8),
      openWindows,
    };
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      const report = runAllSelfTests();
      setSuiteReport(report);
      const synced = syncSelfTestReportToIssueTracker(
        report,
        collectTelemetry()
      );
      setIssues(synced);
      onIssuesChanged?.(synced);

      if (initialTab === 'visual_bug_reporter' && !capturedFrameUrl) {
        handleCaptureViewport();
      }
    }
  }, [isOpen, initialTab]);

  const handleRunAllSuites = () => {
    const report = runAllSelfTests();
    setSuiteReport(report);
    const synced = syncSelfTestReportToIssueTracker(report, collectTelemetry());
    setIssues(synced);
    onIssuesChanged?.(synced);
  };

  const handleRunGpuStressTest = () => {
    const res = runLiveViewportGpuRebuildStressTest(50);
    setGpuStressResult(res);
  };

  const handleRunDomAudit = () => {
    const res = runLiveDomAndErgonomicsAudit();
    setDomAuditResult(res);
  };

  // Capture live 3D WebGL frame or synthesize a clean studio diagnostic frame if headless
  const handleCaptureViewport = (preserveAnnotations = false) => {
    const rawUrl = captureViewportDiagnosticFrame();
    if (rawUrl && rawUrl.startsWith('data:image/')) {
      setCapturedFrameUrl(rawUrl);
      if (!preserveAnnotations) {
        setAnnotations([]);
        setLatestVisionAnalysis(null);
      }
      return;
    }
    // Fallback diagnostic canvas snapshot if WebGL context is unavailable
    const offscreen = document.createElement('canvas');
    offscreen.width = 960;
    offscreen.height = 540;
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 960, 540);
      ctx.strokeStyle = '#1e293b';
      for (let x = 0; x < 960; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 540);
        ctx.stroke();
      }
      for (let y = 0; y < 540; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(960, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(
        `LFS Block Studio Diagnostic Frame (${activeBlockCount} blocks | tool: ${activeToolMode})`,
        32,
        48
      );
      setCapturedFrameUrl(offscreen.toDataURL('image/png'));
      if (!preserveAnnotations) {
        setAnnotations([]);
        setLatestVisionAnalysis(null);
      }
    }
  };

  // Render base screenshot + red annotations onto the interactive canvas
  const redrawAnnotationCanvas = (
    regionsToDraw: NormalizedAnnotationRegion[] = annotations,
    previewRegion?: NormalizedAnnotationRegion | null
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (baseImageRef.current && baseImageRef.current.complete) {
      ctx.drawImage(baseImageRef.current, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.fillText(
        'Click "Capture Live 3D Viewport" or draw directly on the diagnostic canvas to circle a bug.',
        24,
        h / 2
      );
    }

    const allRegions = previewRegion
      ? [...regionsToDraw, previewRegion]
      : regionsToDraw;

    allRegions.forEach((reg, idx) => {
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3.5;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';

      if (reg.shape === 'circle') {
        const cx = (reg.x + reg.w / 2) * w;
        const cy = (reg.y + reg.h / 2) * h;
        const rx = Math.max(6, (reg.w / 2) * w);
        const ry = Math.max(6, (reg.h / 2) * h);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (reg.shape === 'box') {
        const bx = reg.x * w;
        const by = reg.y * h;
        const bw = Math.max(8, reg.w * w);
        const bh = Math.max(8, reg.h * h);
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
      } else if (
        reg.shape === 'freehand' &&
        reg.points &&
        reg.points.length > 1
      ) {
        ctx.beginPath();
        ctx.moveTo(reg.points[0].x * w, reg.points[0].y * h);
        for (let i = 1; i < reg.points.length; i++) {
          ctx.lineTo(reg.points[i].x * w, reg.points[i].y * h);
        }
        ctx.stroke();
      } else if (reg.shape === 'pin') {
        const px = reg.x * w;
        const py = reg.y * h;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(reg.pinNumber || idx + 1), px, py);
      }
      ctx.restore();
    });
  };

  useEffect(() => {
    if (!capturedFrameUrl) {
      redrawAnnotationCanvas(annotations, null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      baseImageRef.current = img;
      redrawAnnotationCanvas(annotations, null);
    };
    img.src = capturedFrameUrl;
  }, [capturedFrameUrl, annotations, activeTab]);

  const getNormalizedCanvasPos = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))
    );
    const y = Math.max(
      0,
      Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height))
    );
    return { x, y };
  };

  const handleCanvasPointerDown = (
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!capturedFrameUrl) {
      handleCaptureViewport(true);
    }
    const pos = getNormalizedCanvasPos(e);
    if (drawTool === 'pin') {
      const pinCount =
        annotations.filter((a) => a.shape === 'pin').length + 1;
      const next: NormalizedAnnotationRegion = {
        id: `reg_${Date.now()}`,
        shape: 'pin',
        x: pos.x,
        y: pos.y,
        w: 0.04,
        h: 0.04,
        pinNumber: pinCount,
      };
      const updated = [...annotations, next];
      setAnnotations(updated);
      redrawAnnotationCanvas(updated, null);
      return;
    }

    setIsDrawing(true);
    dragStartRef.current = pos;
    freehandPointsRef.current = [pos];
  };

  const handleCanvasPointerMove = (
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing || !dragStartRef.current) return;
    const cur = getNormalizedCanvasPos(e);
    const start = dragStartRef.current;

    if (drawTool === 'freehand') {
      freehandPointsRef.current.push(cur);
      const xs = freehandPointsRef.current.map((p) => p.x);
      const ys = freehandPointsRef.current.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      redrawAnnotationCanvas(annotations, {
        id: 'preview',
        shape: 'freehand',
        x: minX,
        y: minY,
        w: Math.max(0.02, maxX - minX),
        h: Math.max(0.02, maxY - minY),
        points: [...freehandPointsRef.current],
      });
    } else {
      const minX = Math.min(start.x, cur.x);
      const minY = Math.min(start.y, cur.y);
      const w = Math.max(0.03, Math.abs(cur.x - start.x));
      const h = Math.max(0.03, Math.abs(cur.y - start.y));
      redrawAnnotationCanvas(annotations, {
        id: 'preview',
        shape: drawTool === 'box' ? 'box' : 'circle',
        x: minX,
        y: minY,
        w,
        h,
      });
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !dragStartRef.current) return;
    setIsDrawing(false);
    const cur = getNormalizedCanvasPos(e);
    const start = dragStartRef.current;
    dragStartRef.current = null;

    let newRegion: NormalizedAnnotationRegion;
    if (drawTool === 'freehand') {
      const pts =
        freehandPointsRef.current.length > 1
          ? freehandPointsRef.current
          : [start, { x: start.x + 0.08, y: start.y + 0.08 }];
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      newRegion = {
        id: `reg_${Date.now()}`,
        shape: 'freehand',
        x: minX,
        y: minY,
        w: Math.max(0.04, maxX - minX),
        h: Math.max(0.04, maxY - minY),
        points: pts,
      };
    } else {
      const minX = Math.min(start.x, cur.x);
      const minY = Math.min(start.y, cur.y);
      const w = Math.max(0.06, Math.abs(cur.x - start.x));
      const h = Math.max(0.06, Math.abs(cur.y - start.y));
      newRegion = {
        id: `reg_${Date.now()}`,
        shape: drawTool === 'box' ? 'box' : 'circle',
        x: minX,
        y: minY,
        w,
        h,
      };
    }

    const updated = [...annotations, newRegion];
    setAnnotations(updated);
    redrawAnnotationCanvas(updated, null);
  };

  const handleAnalyzeWithGeminiVision = async (autonomousMode = false) => {
    setIsAnalyzingVision(true);
    try {
      if (!capturedFrameUrl) {
        handleCaptureViewport(true);
      }
      const canvas = canvasRef.current;
      const compositeDataUrl = canvas
        ? canvas.toDataURL('image/png')
        : capturedFrameUrl;
      const telemetry = collectTelemetry();
      const regionsToUse: NormalizedAnnotationRegion[] =
        !autonomousMode && annotations.length > 0
          ? annotations
          : [
              {
                id: 'auto_full_viewport',
                shape: 'box',
                x: 0.05,
                y: 0.05,
                w: 0.9,
                h: 0.9,
                label: 'Autonomous Full-Viewport Inspection',
              },
            ];

      const analysis = await analyzeIssueWithGeminiVision({
        annotatedImageBase64: compositeDataUrl,
        circledRegions: regionsToUse,
        telemetrySnapshot: telemetry,
        userDescription: autonomousMode
          ? 'Autonomous full-screen Gemini Vision layout, HUD ergonomics, and 3D viewport inspection'
          : userDescription,
      });

      setLatestVisionAnalysis(analysis);

      const primaryFile =
        analysis.suspectedFiles[0] || 'src/components/SkyblockViewport.tsx';
      const fingerprint = `vision_triage:${primaryFile}:${analysis.domain}:${analysis.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 48)}`;

      const updatedIssues = upsertTrackedIssue({
        fingerprint,
        title: analysis.title,
        severity: analysis.severity || 'P1',
        source: autonomousMode
          ? 'GEMINI_AUTONOMOUS_AUDIT'
          : 'USER_CIRCLED_SCREENSHOT',
        status: 'TRIAGED_BY_GEMINI',
        domain: analysis.domain || 'UI_OVERLAP',
        annotatedScreenshotDataUrl: compositeDataUrl,
        circledRegions: regionsToUse,
        userDescription:
          userDescription ||
          (autonomousMode
            ? 'Autonomous full-screen Gemini Vision audit'
            : 'Circled viewport area'),
        telemetrySnapshot: telemetry,
        geminiAnalysis: analysis,
      });

      setIssues(updatedIssues);
      onIssuesChanged?.(updatedIssues);
    } finally {
      setIsAnalyzingVision(false);
    }
  };

  const handleUpdateIssueStatus = (issueId: string, nextStatus: IssueStatus) => {
    const next = issues.map((iss) =>
      iss.id === issueId
        ? { ...iss, status: nextStatus, lastSeenAt: new Date().toISOString() }
        : iss
    );
    setIssues(next);
    saveTrackedIssues(next);
    onIssuesChanged?.(next);
  };

  const handleCopyText = (key: string, text: string) => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedId(key);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const handleExportAuditReportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      suiteReport,
      gpuStressResult,
      domAuditResult,
      issues,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lfs-studio-audit-report-${Date.now()}.lfsissues.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportIssuesJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const list = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.issues)
            ? parsed.issues
            : null;
        if (list && list.length > 0) {
          setIssues(list);
          saveTrackedIssues(list);
          onIssuesChanged?.(list);
        }
      } catch {
        // ignore invalid file
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  const filteredIssues = issues.filter((iss) =>
    statusFilter === 'ALL' ? true : iss.status === statusFilter
  );
  const masterPromptText = generateAiStudioMasterFixPrompt(
    issues,
    includeFixedInMasterPrompt
  );

  return (
    <DraggableWindow
      windowId="self_testing_auditor_modal"
      title="Self-Testing Harness, Visual Bug Circle Tool & Self-Publishing Issue Hub"
      icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
      onClose={onClose}
      defaultWidth={980}
      defaultHeight={680}
      defaultX={Math.max(24, Math.round((window.innerWidth - 980) / 2))}
      defaultY={68}
      zIndex={85}
    >
      <div
        className="flex flex-col h-full bg-slate-950 text-slate-100 select-none"
        data-testid="self-testing-auditor-modal"
      >
        {/* Top Navigation Sub-Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/95 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="auditor-tab-self-tests"
              onClick={() => setActiveTab('self_tests')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeTab === 'self_tests'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              1. Automated Self-Test Suites (
              {suiteReport
                ? `${suiteReport.totalPassed}/${suiteReport.totalAssertions}`
                : '6 Suites'}
              )
            </button>

            <button
              type="button"
              data-testid="auditor-tab-visual-bug"
              onClick={() => {
                setActiveTab('visual_bug_reporter');
                if (!capturedFrameUrl) handleCaptureViewport();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeTab === 'visual_bug_reporter'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              2. Circle Bug (Screenshot + Gemini Vision)
            </button>

            <button
              type="button"
              data-testid="auditor-tab-issue-tracker"
              onClick={() => setActiveTab('issue_tracker')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeTab === 'issue_tracker'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Bug className="w-3.5 h-3.5" />
              3. Self-Publishing Issue Tracker ({issues.length})
            </button>

            <button
              type="button"
              data-testid="auditor-tab-prompt-generator"
              onClick={() => setActiveTab('prompt_generator')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeTab === 'prompt_generator'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              4. AI Studio Improvement Prompt
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportAuditReportJson}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 border border-slate-700"
              title="Export complete Self-Test & Issue Tracker JSON report"
            >
              <Download className="w-3 h-3" />
              Export JSON
            </button>
          </div>
        </div>

        {/* Main Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: AUTOMATED SELF-TEST SUITES */}
          {activeTab === 'self_tests' && (
            <div className="space-y-4" data-testid="self-tests-panel">
              {/* Summary Status Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="flex items-center gap-3">
                  {suiteReport?.allPassed ? (
                    <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-bold text-white"
                        data-testid="self-test-summary-headline"
                      >
                        {suiteReport
                          ? `${suiteReport.totalPassed} / ${suiteReport.totalAssertions} Assertions Passed (${suiteReport.totalFailed} Failures)`
                          : 'Ready to Execute 6-Suite Verification Harness'}
                      </span>
                      {suiteReport?.allPassed && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30">
                          0 Failures — All Invariants Verified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Executes real engine functions against adversarial inputs
                      (NaN/Infinity, 65,536-cell OOM bounds, atomic undo, cloud
                      truncation, glTF 2.0 meshes, and IP hygiene) in{' '}
                      <span className="text-cyan-300 font-mono">
                        {suiteReport ? `${suiteReport.totalDurationMs}ms` : '0ms'}
                      </span>
                      .
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="run-all-self-tests-btn"
                    onClick={handleRunAllSuites}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Run All 6 Self-Test Suites
                  </button>

                  <button
                    type="button"
                    data-testid="run-gpu-stress-test-btn"
                    onClick={handleRunGpuStressTest}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    50x GPU Rebuild Stress Test
                  </button>

                  <button
                    type="button"
                    data-testid="run-dom-ergonomics-btn"
                    onClick={handleRunDomAudit}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    DOM Overlap & KLM-GOMS Audit
                  </button>
                </div>
              </div>

              {/* Optional Live GPU & DOM Telemetry Sub-Cards */}
              {(gpuStressResult || domAuditResult) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {gpuStressResult && (
                    <div
                      className="p-3 rounded-lg bg-slate-900/90 border border-cyan-500/30 text-xs space-y-1"
                      data-testid="gpu-stress-result-card"
                    >
                      <div className="flex items-center justify-between font-bold text-cyan-300">
                        <span>
                          WebGL 50x Scene Rebuild Memory Leak Stress Test
                        </span>
                        <span
                          className={
                            gpuStressResult.passed
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }
                        >
                          {gpuStressResult.passed
                            ? 'PASSED (Zero Leak)'
                            : 'WARNING'}
                        </span>
                      </div>
                      <p className="text-slate-300 font-mono text-[11px]">
                        Geometries: {gpuStressResult.geometriesBefore} →{' '}
                        {gpuStressResult.geometriesAfter} (Δ ={' '}
                        {gpuStressResult.deltaGeometries}) | Duration:{' '}
                        {gpuStressResult.durationMs}ms ({gpuStressResult.iterations}x rebuilds)
                      </p>
                    </div>
                  )}

                  {domAuditResult && (
                    <div
                      className="p-3 rounded-lg bg-slate-900/90 border border-amber-500/30 text-xs space-y-1"
                      data-testid="dom-audit-result-card"
                    >
                      <div className="flex items-center justify-between font-bold text-amber-300">
                        <span>Live DOM HUD Collision & KLM-GOMS Inspector</span>
                        <span
                          className={
                            domAuditResult.passed
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }
                        >
                          {domAuditResult.passed ? 'PASSED' : 'OVERLAP DETECTED'}
                        </span>
                      </div>
                      <p className="text-slate-300 font-mono text-[11px]">
                        Viewport: {domAuditResult.viewportWidth}x
                        {domAuditResult.viewportHeight}px | HUD Collisions:{' '}
                        {domAuditResult.overlappingHudPairs.length} | KLM-GOMS
                        Place+Rotate: {domAuditResult.klmGomsPlaceRotateTimeSec}s
                        (&lt; 2.5s target)
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 6 Domain Suite Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suiteReport?.suites.map((suite) => (
                  <div
                    key={suite.domain}
                    data-testid={`suite-card-${suite.domain}`}
                    className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-2.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">
                          {suite.title}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            suite.failedCount === 0
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {suite.passedCount}/{suite.totalCount} Passed (
                          {suite.durationMs}ms)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {suite.description}
                      </p>
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                      {suite.assertions.map((assertion) => (
                        <div
                          key={assertion.id}
                          className="p-2 rounded bg-slate-950/80 border border-slate-800/90 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                              <span
                                className={
                                  assertion.passed
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }
                              >
                                {assertion.passed ? '✓' : '✗'}
                              </span>
                              {assertion.title}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              {assertion.durationMs}ms
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-cyan-300/90 mt-1 break-words">
                            {assertion.actualSummary}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: VISUAL BUG REPORTER (SCREENSHOT + CIRCLE/DRAW + GEMINI VISION) */}
          {activeTab === 'visual_bug_reporter' && (
            <div
              className="grid grid-cols-1 lg:grid-cols-12 gap-4"
              data-testid="visual-bug-reporter-panel"
            >
              {/* Left 7 Cols: Interactive Screenshot & Red Circle/Box/Pin Canvas */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="capture-viewport-btn"
                      onClick={() => handleCaptureViewport(false)}
                      className="px-2.5 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Capture Live 3D Viewport
                    </button>

                    <button
                      type="button"
                      data-testid="tool-circle"
                      onClick={() => setDrawTool('circle')}
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 border ${
                        drawTool === 'circle'
                          ? 'bg-rose-500/25 text-rose-300 border-rose-500/50'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      <Circle className="w-3.5 h-3.5" />
                      Red Circle
                    </button>

                    <button
                      type="button"
                      data-testid="tool-box"
                      onClick={() => setDrawTool('box')}
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 border ${
                        drawTool === 'box'
                          ? 'bg-rose-500/25 text-rose-300 border-rose-500/50'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      <Square className="w-3.5 h-3.5" />
                      Box
                    </button>

                    <button
                      type="button"
                      data-testid="tool-freehand"
                      onClick={() => setDrawTool('freehand')}
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 border ${
                        drawTool === 'freehand'
                          ? 'bg-rose-500/25 text-rose-300 border-rose-500/50'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Freehand
                    </button>

                    <button
                      type="button"
                      data-testid="tool-pin"
                      onClick={() => setDrawTool('pin')}
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 border ${
                        drawTool === 'pin'
                          ? 'bg-rose-500/25 text-rose-300 border-rose-500/50'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Pin ①
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const popped = annotations.slice(0, -1);
                        setAnnotations(popped);
                        redrawAnnotationCanvas(popped, null);
                      }}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      title="Undo last annotation"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAnnotations([]);
                        redrawAnnotationCanvas([], null);
                      }}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      title="Clear annotations"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="relative rounded-xl overflow-hidden border-2 border-rose-500/40 bg-slate-950 shadow-inner">
                  <canvas
                    ref={canvasRef}
                    width={720}
                    height={405}
                    data-testid="visual-bug-annotation-canvas"
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                    className="w-full h-auto cursor-crosshair block touch-none"
                  />
                  <div className="px-3 py-1.5 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Draw a red circle, box, or pin over any visual glitch,
                      overlapping window, or unclickable block.
                    </span>
                    <span className="font-mono text-rose-300">
                      {annotations.length} region(s) circled
                    </span>
                  </div>
                </div>
              </div>

              {/* Right 5 Cols: Description, Gemini Vision Triage Button & Live Diagnosis */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-rose-400" />
                      Multimodal Gemini Vision Bug Inspector
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      POST /api/ai/analyze-issue
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      What looks wrong in the circled region? (Optional)
                    </label>
                    <textarea
                      value={userDescription}
                      onChange={(e) => setUserDescription(e.target.value)}
                      data-testid="visual-bug-description-input"
                      rows={3}
                      placeholder="e.g. The Wand gizmo or floating window overlaps the top ribbon or blocks raycast clicks..."
                      className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-400 select-text"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={isAnalyzingVision}
                      data-testid="analyze-circled-bug-btn"
                      onClick={() => void handleAnalyzeWithGeminiVision(false)}
                      className="w-full py-2.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 shadow"
                    >
                      {isAnalyzingVision ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Inspecting Circled Screenshot with Gemini Vision...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Analyze Circled Bug with Gemini Vision & Auto-File
                          Ticket
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isAnalyzingVision}
                      data-testid="autonomous-vision-audit-btn"
                      onClick={() => void handleAnalyzeWithGeminiVision(true)}
                      className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Run Autonomous Full-Screen Vision Audit (Zero Drawing)
                    </button>
                  </div>
                </div>

                {/* Latest Vision Analysis Result Card */}
                {latestVisionAnalysis ? (
                  <div
                    className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/40 space-y-2 text-xs"
                    data-testid="vision-analysis-result-card"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-emerald-300">
                        [{latestVisionAnalysis.severity}]{" "}
                        {latestVisionAnalysis.title}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                        Filed to Tracker ({latestVisionAnalysis.confidence}%
                        conf)
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      <strong className="text-slate-100">Root Cause:</strong>{" "}
                      {latestVisionAnalysis.rootCause}
                    </p>
                    <p className="text-slate-300 text-[11px]">
                      <strong className="text-slate-100">
                        Suspected Files:
                      </strong>{" "}
                      <span className="font-mono text-cyan-300">
                        {latestVisionAnalysis.suspectedFiles.join(", ")}
                      </span>
                    </p>
                    <p className="text-slate-300 text-[11px]">
                      <strong className="text-slate-100">
                        Recommended Fix:
                      </strong>{" "}
                      {latestVisionAnalysis.recommendedCodeFix}
                    </p>
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            "vision_prompt",
                            latestVisionAnalysis.aiStudioFixPrompt
                          )
                        }
                        className="px-2.5 py-1.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-[11px] font-semibold flex items-center gap-1 border border-emerald-500/40"
                      >
                        {copiedId === "vision_prompt" ? (
                          <>
                            <Check className="w-3 h-3" /> Copied Fix Prompt!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Copy AI Studio Fix
                            Prompt
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("issue_tracker")}
                        className="text-[11px] text-cyan-300 hover:underline"
                      >
                        View in Issue Backlog →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 space-y-1.5">
                    <div className="font-semibold text-slate-200">
                      How the Self-Publishing Visual Bug Loop Works:
                    </div>
                    <p>
                      1. Snap a live 3D screenshot and draw a red circle around
                      any UI overlap, unclickable block, or visual glitch.
                    </p>
                    <p>
                      2. Gemini Vision inspects the circled pixels alongside
                      normalized coordinates and WebGL/state telemetry.
                    </p>
                    <p>
                      3. The issue is deduplicated by fingerprint, saved to
                      IndexedDB, and compiled into a ready-to-paste AI Studio
                      fix prompt.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SELF-PUBLISHING ISSUE TRACKER & BUG BACKLOG */}
          {activeTab === 'issue_tracker' && (
            <div className="space-y-3" data-testid="issue-tracker-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      'ALL',
                      'OPEN',
                      'TRIAGED_BY_GEMINI',
                      'PATCH_READY',
                      'VERIFIED_FIXED',
                      'REGRESSION',
                    ] as const
                  ).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                        statusFilter === st
                          ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st} (
                      {st === 'ALL'
                        ? issues.length
                        : issues.filter((i) => i.status === st).length}
                      )
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileImportRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportIssuesJson}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileImportRef.current?.click()}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 border border-slate-700"
                  >
                    <Upload className="w-3 h-3" />
                    Import (.lfsissues.json)
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {filteredIssues.map((issue) => (
                  <div
                    key={issue.id}
                    data-testid={`tracked-issue-card-${issue.id}`}
                    className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-xs font-bold">
                          {issue.id}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            issue.severity === 'P0'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {issue.severity}
                        </span>
                        <span className="text-xs font-bold text-white">
                          {issue.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            issue.status === 'VERIFIED_FIXED'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : issue.status === 'REGRESSION'
                                ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {issue.status}
                        </span>

                        <select
                          aria-label={`Change status for ${issue.id}`}
                          value={issue.status}
                          onChange={(e) =>
                            handleUpdateIssueStatus(
                              issue.id,
                              e.target.value as IssueStatus
                            )
                          }
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-200"
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="TRIAGED_BY_GEMINI">
                            TRIAGED_BY_GEMINI
                          </option>
                          <option value="PATCH_READY">PATCH_READY</option>
                          <option value="VERIFIED_FIXED">VERIFIED_FIXED</option>
                          <option value="REGRESSION">REGRESSION</option>
                        </select>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>Fingerprint: {issue.fingerprint}</span>
                      <span>Source: {issue.source}</span>
                      <span>Occurrences: {issue.occurrenceCount}</span>
                    </div>

                    {issue.geminiAnalysis && (
                      <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800/90 text-[11px] space-y-1">
                        <div className="text-slate-300">
                          <strong className="text-slate-100">
                            Root Cause:
                          </strong>{" "}
                          {issue.geminiAnalysis.rootCause}
                        </div>
                        <div className="text-slate-300">
                          <strong className="text-slate-100">
                            Remediation:
                          </strong>{" "}
                          {issue.geminiAnalysis.recommendedCodeFix}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="font-mono text-[10px] text-cyan-300 flex items-center gap-1">
                            <FileCode2 className="w-3 h-3" />
                            {issue.geminiAnalysis.suspectedFiles.join(', ')}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(
                                issue.id,
                                issue.geminiAnalysis!.aiStudioFixPrompt
                              )
                            }
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 border border-slate-700"
                          >
                            {copiedId === issue.id ? (
                              <>
                                <Check className="w-3 h-3" /> Copied Prompt
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> Copy Fix Prompt
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: AI STUDIO CONTINUOUS IMPROVEMENT PROMPT GENERATOR */}
          {activeTab === 'prompt_generator' && (
            <div className="space-y-3" data-testid="prompt-generator-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    Master AI Studio Self-Improvement & Regression Prompt
                    Compiler
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Compiles all tracked issues, circled viewport coordinates,
                    WebGL telemetry, and suspected file paths into a single
                    prompt you can paste directly into AI Studio Build.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeFixedInMasterPrompt}
                      onChange={(e) =>
                        setIncludeFixedInMasterPrompt(e.target.checked)
                      }
                      className="rounded border-slate-700"
                    />
                    Include Verified Fixed Ledger
                  </label>

                  <button
                    type="button"
                    data-testid="copy-master-prompt-btn"
                    onClick={() =>
                      handleCopyText('master_prompt', masterPromptText)
                    }
                    className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                  >
                    {copiedId === 'master_prompt' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied Master Prompt!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Master AI Studio Prompt
                      </>
                    )}
                  </button>
                </div>
              </div>

              <pre
                data-testid="master-fix-prompt-output"
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap overflow-x-auto max-h-[420px] select-text"
              >
                {masterPromptText}
              </pre>
            </div>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};
