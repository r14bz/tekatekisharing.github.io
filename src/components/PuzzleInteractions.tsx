import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react';
import { CrosswordPuzzle, PuzzleComment, PuzzleReactionType, PuzzleReactions, UserProfile } from '../types/tts';
import { CloudService } from '../services/cloudService';
import { StorageService } from '../services/storageService';

interface PuzzleInteractionsProps {
  puzzle: CrosswordPuzzle;
  userProfile: UserProfile;
  onUpdatePuzzle?: (updatedPuzzle: CrosswordPuzzle) => void;
  onOpenSyncModal?: () => void;
  className?: string;
}

const REACTION_CONFIG: {
  type: PuzzleReactionType;
  label: string;
  emoji: string;
  color: string;
  activeBg: string;
  activeBorder: string;
}[] = [
  {
    type: 'like',
    label: 'Suka',
    emoji: '👍',
    color: 'text-blue-600',
    activeBg: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',
    activeBorder: 'border-blue-300 dark:border-blue-700 ring-2 ring-blue-200 dark:ring-blue-900',
  },
  {
    type: 'laugh',
    label: 'Lucu',
    emoji: '😂',
    color: 'text-amber-600',
    activeBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
    activeBorder: 'border-amber-300 dark:border-amber-700 ring-2 ring-amber-200 dark:ring-amber-900',
  },
  {
    type: 'love',
    label: 'Suka Banget',
    emoji: '❤️',
    color: 'text-rose-600',
    activeBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
    activeBorder: 'border-rose-300 dark:border-rose-700 ring-2 ring-rose-200 dark:ring-rose-900',
  },
  {
    type: 'think',
    label: 'Mikir Keras',
    emoji: '🤔',
    color: 'text-purple-600',
    activeBg: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300',
    activeBorder: 'border-purple-300 dark:border-purple-700 ring-2 ring-purple-200 dark:ring-purple-900',
  },
  {
    type: 'fire',
    label: 'Seru',
    emoji: '🔥',
    color: 'text-orange-600',
    activeBg: 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300',
    activeBorder: 'border-orange-300 dark:border-orange-700 ring-2 ring-orange-200 dark:ring-orange-900',
  },
  {
    type: 'sad',
    label: 'Sulit',
    emoji: '😢',
    color: 'text-slate-600',
    activeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    activeBorder: 'border-slate-300 dark:border-slate-600 ring-2 ring-slate-200 dark:ring-slate-700',
  },
];

export const PuzzleInteractions: React.FC<PuzzleInteractionsProps> = ({
  puzzle,
  userProfile,
  onUpdatePuzzle,
  onOpenSyncModal,
  className = '',
}) => {
  const getInitialReactions = (): PuzzleReactions => {
    if (puzzle.reactions) {
      return puzzle.reactions;
    }
    const local = StorageService.getPuzzleReactions(puzzle.id);
    return local || {
      like: 0,
      laugh: 0,
      love: 0,
      think: 0,
      fire: 0,
      sad: 0,
    };
  };

  const getInitialComments = (): PuzzleComment[] => {
    if (Array.isArray(puzzle.comments) && puzzle.comments.length > 0) {
      return puzzle.comments;
    }
    const local = StorageService.getPuzzleComments(puzzle.id);
    if (local && local.length > 0) return local;
    return [];
  };

  const [reactions, setReactions] = useState<PuzzleReactions>(getInitialReactions);
  const [userReaction, setUserReaction] = useState<PuzzleReactionType | null>(
    StorageService.getUserPuzzleReaction(puzzle.id)
  );
  const [comments, setComments] = useState<PuzzleComment[]>(getInitialComments);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [loginAlert, setLoginAlert] = useState<string | null>(null);

  useEffect(() => {
    if (puzzle.reactions) {
      setReactions(puzzle.reactions);
      StorageService.updatePuzzleReactions(puzzle.id, puzzle.reactions);
    } else {
      const localReactions = StorageService.getPuzzleReactions(puzzle.id);
      if (localReactions) {
        setReactions(localReactions);
      }
    }

    if (Array.isArray(puzzle.comments) && puzzle.comments.length > 0) {
      setComments(puzzle.comments);
    } else {
      const localComments = StorageService.getPuzzleComments(puzzle.id);
      if (localComments && localComments.length > 0) {
        setComments(localComments);
      }
    }
    setUserReaction(StorageService.getUserPuzzleReaction(puzzle.id));
  }, [puzzle.id, puzzle.reactions, puzzle.comments]);

  const handleReact = async (type: PuzzleReactionType, e: React.MouseEvent) => {
    e.stopPropagation();

    // Requirement 3: Reaksi hanya untuk pengguna yang sudah login
    if (!userProfile.isLoggedIn) {
      setLoginAlert('Login terlebih dahulu untuk memberikan reaksi');
      setTimeout(() => setLoginAlert(null), 3500);
      if (onOpenSyncModal) {
        onOpenSyncModal();
      }
      return;
    }

    const prev = userReaction;
    const isTogglingOff = prev === type;
    const nextReaction = isTogglingOff ? null : type;

    // Optimistic UI update
    const updated = { ...reactions };
    if (prev && updated[prev] > 0) {
      updated[prev] = Math.max(0, updated[prev] - 1);
    }
    if (nextReaction) {
      updated[nextReaction] = (updated[nextReaction] || 0) + 1;
    }

    setReactions(updated);
    setUserReaction(nextReaction);
    StorageService.setUserPuzzleReaction(puzzle.id, nextReaction);

    if (onUpdatePuzzle) {
      onUpdatePuzzle({
        ...puzzle,
        reactions: updated,
      });
    }

    try {
      const serverReactions = await CloudService.reactToPuzzle(
        puzzle.id,
        nextReaction,
        prev,
        userProfile
      );
      if (serverReactions) {
        setReactions(serverReactions);
        if (onUpdatePuzzle) {
          onUpdatePuzzle({
            ...puzzle,
            reactions: serverReactions,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to sync reaction to server:', err);
    }
  };

  const handleAddComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Requirement 3: Komentar hanya untuk pengguna yang sudah login
    if (!userProfile.isLoggedIn) {
      setLoginAlert('Login terlebih dahulu untuk menulis komentar');
      setTimeout(() => setLoginAlert(null), 3500);
      if (onOpenSyncModal) {
        onOpenSyncModal();
      }
      return;
    }

    const text = newCommentText.trim();
    if (!text || isSubmittingComment) return;

    setIsSubmittingComment(true);

    const tempComment: PuzzleComment = {
      id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      puzzleId: puzzle.id,
      authorName: userProfile.name || 'Pemain TTS',
      authorAvatar: userProfile.avatar || '🦊',
      authorId: userProfile.id,
      authorEmail: userProfile.email,
      content: text,
      createdAt: Date.now(),
    };

    // Optimistic update
    const nextComments = [...comments, tempComment];
    setComments(nextComments);
    setNewCommentText('');

    if (onUpdatePuzzle) {
      onUpdatePuzzle({
        ...puzzle,
        comments: nextComments,
      });
    }

    try {
      const saved = await CloudService.addPuzzleComment(
        puzzle.id,
        {
          authorName: userProfile.name,
          authorAvatar: userProfile.avatar,
          authorId: userProfile.id,
          authorEmail: userProfile.email,
          content: text,
        },
        userProfile
      );
      if (saved) {
        setComments((prev) => prev.map((c) => (c.id === tempComment.id ? saved : c)));
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextComments = comments.filter((c) => c.id !== commentId);
    setComments(nextComments);
    if (onUpdatePuzzle) {
      onUpdatePuzzle({
        ...puzzle,
        comments: nextComments,
      });
    }
    await CloudService.deletePuzzleComment(puzzle.id, commentId);
  };

  const formatTimeAgo = (timestamp: number) => {
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSeconds < 60) return 'Baru saja';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} mnt lalu`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} hari lalu`;
    return new Date(timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  return (
    <div
      id={`puzzle-interactions-${puzzle.id}`}
      className={`w-full max-w-full min-w-0 border-t border-slate-100 dark:border-slate-800 pt-2.5 mt-2.5 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Login Alert Banner if triggered */}
      {loginAlert && (
        <div className="mb-2 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-1.5 truncate">
            <Lock className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="truncate">{loginAlert}</span>
          </div>
          {onOpenSyncModal && (
            <button
              type="button"
              onClick={onOpenSyncModal}
              className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
            >
              Login
            </button>
          )}
        </div>
      )}

      {/* Reaction Buttons Row - Compact, tight, and responsive */}
      <div className="w-full max-w-full">
        <div className="grid grid-cols-6 gap-1 w-full">
          {REACTION_CONFIG.map((item) => {
            const isSelected = userProfile.isLoggedIn && userReaction === item.type;
            const count = reactions[item.type] || 0;
            return (
              <button
                key={item.type}
                id={`btn-react-${item.type}-${puzzle.id}`}
                type="button"
                onClick={(e) => handleReact(item.type, e)}
                className={`flex items-center justify-center gap-1 py-1 px-1 rounded-lg border transition-all cursor-pointer min-w-0 ${
                  isSelected
                    ? `${item.activeBg} ${item.activeBorder} shadow-2xs font-bold scale-[1.02]`
                    : 'border-slate-200/90 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
                title={userProfile.isLoggedIn ? `${item.label} (${count})` : 'Login untuk memberikan reaksi'}
              >
                <span className="text-xs sm:text-sm leading-none select-none">
                  {item.emoji}
                </span>
                <span className={`text-[10px] sm:text-[11px] font-bold leading-none ${isSelected ? item.color : 'text-slate-500 dark:text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toggle Comments Bar */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          id={`btn-toggle-comments-${puzzle.id}`}
          onClick={() => setIsCommentsOpen(!isCommentsOpen)}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
        >
          <MessageSquare className="w-3 h-3 text-indigo-500 shrink-0" />
          <span>
            {comments.length > 0 ? `${comments.length} Komentar` : 'Tulis Komentar'}
          </span>
          {isCommentsOpen ? (
            <ChevronUp className="w-3 h-3 text-slate-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          )}
        </button>

        {comments.length > 0 && !isCommentsOpen && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
            Terakhir: <strong className="text-slate-600 dark:text-slate-300 font-medium">{comments[comments.length - 1]?.authorName}</strong>
          </span>
        )}
      </div>

      {/* Expanded Comments Drawer / Section */}
      {isCommentsOpen && (
        <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-700/80 space-y-3 animate-in fade-in duration-150">
          {/* Comment Form or Login Gate */}
          {userProfile.isLoggedIn ? (
            <form onSubmit={handleAddComment} className="flex gap-2 items-start w-full">
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-sm shrink-0 border border-indigo-200 dark:border-indigo-800 select-none">
                {userProfile.avatar || '🦊'}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="relative">
                  <input
                    id={`comment-input-${puzzle.id}`}
                    type="text"
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder={`Tulis ulasan sebagai ${userProfile.name}...`}
                    className="w-full pl-3 pr-8 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 rounded-xl outline-none transition-all placeholder:text-slate-400 text-slate-800 dark:text-white"
                    maxLength={300}
                  />
                  <button
                    id={`btn-send-comment-${puzzle.id}`}
                    type="submit"
                    disabled={!newCommentText.trim() || isSubmittingComment}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white transition-all cursor-pointer shadow-2xs"
                    title="Kirim"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-0.5">
                  <span className="truncate">Sebagai <strong className="text-slate-600 dark:text-slate-300 font-medium">{userProfile.name}</strong></span>
                  <span>{newCommentText.length}/300</span>
                </div>
              </div>
            </form>
          ) : (
            <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 rounded-2xl flex items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="text-slate-700 dark:text-slate-200 font-medium text-[11px]">
                  Komentar dan reaksi hanya untuk pengguna yang sudah login.
                </span>
              </div>
              {onOpenSyncModal && (
                <button
                  type="button"
                  id={`btn-login-to-comment-${puzzle.id}`}
                  onClick={onOpenSyncModal}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-xl shrink-0 transition-colors shadow-2xs cursor-pointer"
                >
                  Login
                </button>
              )}
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
            {comments.length === 0 ? (
              <p className="text-center py-3 text-[11px] text-slate-400 dark:text-slate-500 italic bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                Belum ada komentar untuk teka-teki silang ini.
              </p>
            ) : (
              comments.map((c) => {
                const isOwn = Boolean(
                  userProfile.isLoggedIn &&
                  (c.authorId === userProfile.id ||
                    (userProfile.email && c.authorEmail === userProfile.email) ||
                    c.authorName === userProfile.name)
                );
                return (
                  <div
                    key={c.id}
                    id={`comment-${c.id}`}
                    className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 text-xs"
                  >
                    <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs shrink-0 select-none">
                      {c.authorAvatar || '👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] truncate">
                            {c.authorName}
                          </span>
                          {isOwn && (
                            <span className="text-[9px] px-1 py-0.2 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded font-medium shrink-0">
                              Kamu
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[9px] text-slate-400 dark:text-slate-500">
                            {formatTimeAgo(c.createdAt)}
                          </span>
                          {isOwn && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteComment(c.id, e)}
                              className="text-slate-400 hover:text-rose-500 p-0.5 transition-colors cursor-pointer"
                              title="Hapus komentar"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed break-words">
                        {c.content}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
