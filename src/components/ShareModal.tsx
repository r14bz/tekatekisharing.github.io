import React, { useState } from 'react';
import { Share2, Copy, Check, X, Tag } from 'lucide-react';
import { CrosswordPuzzle } from '../types/tts';
import { SyncService } from '../services/syncService';

interface ShareModalProps {
  isOpen: boolean;
  puzzle: CrosswordPuzzle;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  puzzle,
  onClose,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  // Primary share code is either custom code or encoded share code
  const displayShareCode = puzzle.customCode?.trim() || SyncService.encodePuzzleToShareCode(puzzle);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(displayShareCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Teka-Teki Silang: ${puzzle.title}`,
          text: `Ayo mainkan teka-teki silang "${puzzle.title}" buatan ${puzzle.authorName}!\nMasukkan kode teka-teki ini di aplikasi TTS: ${displayShareCode}`,
        });
      } catch (e) {
        console.warn('Share cancelled or not supported', e);
      }
    } else {
      handleCopyCode();
    }
  };

  return (
    <div
      id="share-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
    >
      <div
        id="share-modal-content"
        className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-2xl relative"
      >
        <button
          type="button"
          id="btn-close-share-modal"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-800">Bagikan Kode Teka-Teki</h3>
            <p className="text-xs text-slate-500 font-medium">
              Bagikan kode unik ini kepada teman untuk dimainkan bersama
            </p>
          </div>
        </div>

        {/* Puzzle Info Summary */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-5 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-slate-800 text-sm">{puzzle.title}</h4>
            <p className="text-xs text-slate-500">
              Oleh: <span className="text-slate-800 font-semibold">{puzzle.authorName}</span> • {puzzle.width}x{puzzle.height} Kotak • {puzzle.clues.length} Soal
            </p>
          </div>
          <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-200 font-semibold">
            {puzzle.customCode ? 'Kode Kustom' : 'Kode TTS'}
          </span>
        </div>

        {/* Share Code Display (Direct link removed as requested) */}
        <div className="mb-5">
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-indigo-600" /> Kode Teka-Teki Silang:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              id="input-share-code"
              readOnly
              value={displayShareCode}
              className="flex-1 bg-indigo-50/50 border border-indigo-200 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-indigo-950 select-all tracking-wider text-center"
            />
            <button
              type="button"
              id="btn-copy-share-code"
              onClick={handleCopyCode}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                copiedCode
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
              }`}
            >
              {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedCode ? 'Tersalin!' : 'Salin Kode'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 text-center">
            Teman Anda dapat memasukkan kode ini di menu <strong>Pustaka</strong> &gt; <strong>Masukkan Kode</strong>.
          </p>
        </div>

        {/* Action button */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            id="btn-modal-share-device"
            onClick={handleNativeShare}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            Bagikan ke Aplikasi
          </button>

          <button
            type="button"
            id="btn-modal-close-share"
            onClick={onClose}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
