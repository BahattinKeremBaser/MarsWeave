/**
 * MARSWEAVE — Scientific Aerospace Mission Control Navigation Bar
 */

import { LOGO_URL } from '../../data/logo';
import React, { useState } from 'react';
import {
  Compass,
  Sparkles,
  Bot,
  Database,
  FileText,
  Radio,
  PlayCircle,
  HelpCircle,
  BookOpen,
  Menu,
  X
} from 'lucide-react';

export type PageId =
  | 'HOME'
  | 'THE PROBLEM'
  | 'HOW IT WORKS'
  | 'NASA DATA'
  | 'SCIENCE'
  | 'SIMULATOR'
  | 'MISSION REPORT'
  | 'SOURCES';

interface HeaderBarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  onOpenWhatIf: () => void;
  onOpenCopilot: () => void;
  onOpenProvenance: () => void;
  onOpenReport: () => void;
  onStartDemoTour: () => void;
  onOpenBriefing: () => void;
  advanced: boolean;
  onToggleAdvanced: (v: boolean) => void;
  currentSol: number;
  localSolarTime: string;
  dustTau: number;
  commsPct: number;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentPage,
  onNavigate,
  onOpenWhatIf,
  onOpenCopilot,
  onOpenProvenance,
  onOpenReport,
  onStartDemoTour,
  onOpenBriefing,
  advanced,
  onToggleAdvanced,
  currentSol,
  localSolarTime,
  dustTau,
  commsPct
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems: PageId[] = advanced
    ? ['HOME', 'THE PROBLEM', 'HOW IT WORKS', 'NASA DATA', 'SCIENCE', 'SIMULATOR', 'MISSION REPORT', 'SOURCES']
    : ['HOME', 'SIMULATOR', 'SOURCES'];
  const NAV_LABEL: Record<PageId, string> = {
    'HOME': 'Home', 'THE PROBLEM': 'The problem', 'HOW IT WORKS': 'How it works', 'NASA DATA': 'NASA data',
    'SCIENCE': 'Science', 'SIMULATOR': 'Simulator', 'MISSION REPORT': 'Mission report', 'SOURCES': 'Sources'
  };
  const label = (item: PageId) => (!advanced && item === 'SIMULATOR' ? 'Play' : NAV_LABEL[item]);

  const handleMobileNav = (item: PageId) => {
    onNavigate(item);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className="h-14 bg-[#0a0d13] hairline-b px-3 sm:px-4 flex items-center justify-between select-none z-30 relative font-sans text-xs">
        {/* Brand Identity */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => handleMobileNav('HOME')}
            className="flex items-center gap-2 sm:gap-2.5 text-left cursor-pointer group"
          >
            <img src={LOGO_URL} alt="MARSWEAVE logo" className="w-9 h-9 rounded-lg object-cover shadow-md" />
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold tracking-tight text-white font-sans text-xs sm:text-sm group-hover:text-[#c85a32] transition">
                  Marsweave
                </span>
              </div>
              <div className="text-[9px] sm:text-[10px] font-mono text-[#6b7788] hidden sm:block">
                Human Mars mission planner
              </div>
            </div>
          </button>
        </div>

        {/* Main Scientific Website Navigation Tabs (Desktop xl+) */}
        <nav className={`hidden ${advanced ? 'xl:flex' : 'md:flex'} items-center gap-1 font-mono text-[11px]`}>
          {navItems.map(item => {
            const isActive = currentPage === item;
            return (
              <button
                key={item}
                onClick={() => onNavigate(item)}
                className={`px-3 py-1.5 rounded transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#181d28] text-white font-semibold border border-[#262f40]'
                    : 'text-[#8b95a5] hover:text-white hover:bg-[#121620]'
                }`}
              >
                {label(item)}
              </button>
            );
          })}
        </nav>

        {/* Right Quick Controls & Mission Telemetry */}
        <div className="flex items-center gap-1.5 sm:gap-2 font-mono text-xs">
          {/* Mode switch: EASY (simple) / ADVANCED (all tools) */}
          <div className="flex items-center rounded border border-[#1e2533] overflow-hidden text-[11px]" data-testid="mode-switch">
            <button
              onClick={() => onToggleAdvanced(false)}
              data-testid="mode-easy"
              className={`px-2.5 py-1.5 cursor-pointer transition ${!advanced ? 'bg-[#10b981] text-white font-bold' : 'bg-[#121620] text-[#8b95a5] hover:text-white'}`}
            >
              Easy
            </button>
            <button
              onClick={() => onToggleAdvanced(true)}
              data-testid="mode-advanced"
              className={`px-2.5 py-1.5 cursor-pointer transition ${advanced ? 'bg-[#c85a32] text-white font-bold' : 'bg-[#121620] text-[#8b95a5] hover:text-white'}`}
            >
              Advanced
            </button>
          </div>

          {/* Compact Sol status */}
          <div className={`${advanced ? 'hidden 2xl:flex' : 'hidden'} items-center gap-2 px-2.5 py-1 rounded bg-[#0f131c] border border-[#1c2230] text-[11px] text-[#8b95a5]`}>
            <span>Sol {currentSol}</span>
            <span className="text-gray-600">•</span>
            <span className="text-[#3898b8]">MRO in view {commsPct}% of sol</span>
          </div>

          {/* What-If Lab button */}
          {advanced && (
          <button
            onClick={onOpenWhatIf}
            className="px-2 sm:px-2.5 py-1.5 bg-[#121620] hover:bg-[#1a202c] border border-[#1e2533] text-[#cdd3de] rounded text-[11px] flex items-center gap-1.5 transition cursor-pointer"
            title="Open What-If Scenario Analysis Lab"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#d49938]" />
            <span className="hidden md:inline">What-if lab</span>
          </button>
          )}

          {/* Mission Assistant */}
          {advanced && (
          <button
            onClick={onOpenCopilot}
            className="px-2 sm:px-2.5 py-1.5 bg-[#121620] hover:bg-[#1a202c] border border-[#1e2533] text-[#cdd3de] rounded text-[11px] flex items-center gap-1.5 transition cursor-pointer"
            title="Open Flight Controller Mission Assistant"
          >
            <Bot className="w-3.5 h-3.5 text-[#3898b8]" />
            <span className="hidden md:inline">Assistant</span>
          </button>
          )}

          {/* Mobile Hamburger Menu Toggle Button */}
          <button
            onClick={() => setIsMobileMenuOpen(v => !v)}
            className="xl:hidden p-1.5 rounded bg-[#121620] hover:bg-[#1b2230] border border-[#1e2533] text-gray-300 hover:text-white transition"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4 text-[#e25c2b]" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Slide-Down Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="xl:hidden fixed inset-x-0 top-14 z-50 bg-[#0a0d14]/98 backdrop-blur-xl border-b border-[#1e2533] shadow-2xl p-4 font-mono text-xs animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#18202e] text-[11px] text-[#8b95a5]">
            <span className="text-white font-semibold">Marsweave mission directory</span>
            <div className="flex items-center gap-2">
              <span className="text-[#e25c2b]">SOL {currentSol}</span>
              <span>•</span>
              <span className="text-[#38bdf8]">MRO in view {commsPct}% of sol</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {navItems.map(item => {
              const isActive = currentPage === item;
              return (
                <button
                  key={item}
                  onClick={() => handleMobileNav(item)}
                  className={`text-left px-3 py-2 rounded text-xs transition flex items-center justify-between ${
                    isActive
                      ? 'bg-[#c85a32]/20 text-[#e25c2b] border border-[#c85a32]/40 font-bold'
                      : 'text-gray-300 hover:text-white hover:bg-[#141a24] border border-transparent'
                  }`}
                >
                  <span>{label(item)}</span>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#e25c2b]" />}
                </button>
              );
            })}
          </div>

          {advanced && (
          <div className="pt-2 border-t border-[#18202e] grid grid-cols-2 gap-2 text-[11px]">
            <button
              onClick={() => {
                onOpenBriefing();
                setIsMobileMenuOpen(false);
              }}
              className="py-1.5 px-2 bg-[#121620] hover:bg-[#1a202c] border border-[#1e2533] rounded text-gray-300 text-center"
            >
              Mission briefing
            </button>
            <button
              onClick={() => {
                onOpenProvenance();
                setIsMobileMenuOpen(false);
              }}
              className="py-1.5 px-2 bg-[#121620] hover:bg-[#1a202c] border border-[#1e2533] rounded text-gray-300 text-center"
            >
              Data provenance
            </button>
          </div>
          )}
        </div>
      )}
    </>
  );
};

