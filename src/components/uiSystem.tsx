import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  BellRing,
  X,
} from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'attention';

export interface ToastItem {
  id: string;
  variant?: ToastVariant;
  type?: ToastVariant;
  title: string;
  message?: string;
  description?: string;
  durationMs?: number;
}

interface ToastContextValue {
  notify: (toast: Omit<ToastItem, 'id'>) => void;
  toast: (toast: Omit<ToastItem, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  attention: (title: string, message?: string) => void;
  dismiss: (id: string) => void;
}

type GlobalToastListener = (toast: Omit<ToastItem, 'id'>) => void;
let globalToastListener: GlobalToastListener | null = null;

export function emitGlobalToast(toast: Omit<ToastItem, 'id'>) {
  if (globalToastListener) {
    globalToastListener(toast);
  }
}

export function readInitialThemePreference(): 'light' | 'dark' {
  if (typeof window !== 'undefined') {
    try {
      const saved = document.documentElement.getAttribute('data-theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        return 'dark';
      }
    } catch {
      // Ignore theme inspection errors
    }
  }
  return 'light';
}

export function saveThemePreference(theme: 'light' | 'dark'): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_META: Record<
  ToastVariant,
  {
    borderHex: string;
    iconBgClass: string;
    iconColorClass: string;
    barClass: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  success: {
    borderHex: '#16A34A',
    iconBgClass: 'bg-emerald-500/15 dark:bg-emerald-500/20',
    iconColorClass: 'text-[#16A34A] dark:text-emerald-400',
    barClass: 'bg-[#16A34A]',
    Icon: CheckCircle2,
  },
  error: {
    borderHex: '#DC2626',
    iconBgClass: 'bg-red-500/15 dark:bg-red-500/20',
    iconColorClass: 'text-[#DC2626] dark:text-red-400',
    barClass: 'bg-[#DC2626]',
    Icon: XCircle,
  },
  warning: {
    borderHex: '#F59E0B',
    iconBgClass: 'bg-amber-500/15 dark:bg-amber-500/20',
    iconColorClass: 'text-[#F59E0B] dark:text-amber-400',
    barClass: 'bg-[#F59E0B]',
    Icon: AlertTriangle,
  },
  info: {
    borderHex: '#2563EB',
    iconBgClass: 'bg-blue-500/15 dark:bg-blue-500/20',
    iconColorClass: 'text-[#2563EB] dark:text-blue-400',
    barClass: 'bg-[#2563EB]',
    Icon: Info,
  },
  attention: {
    borderHex: '#6366F1',
    iconBgClass: 'bg-indigo-500/15 dark:bg-indigo-500/20',
    iconColorClass: 'text-[#6366F1] dark:text-indigo-400',
    barClass: 'bg-[#6366F1]',
    Icon: BellRing,
  },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const durationMs = toast.durationMs ?? 4200;
      const resolvedVariant: ToastVariant = toast.variant || toast.type || 'info';
      setToasts((prev) => [...prev.slice(-4), { ...toast, variant: resolvedVariant, id, durationMs }]);
      window.setTimeout(() => {
        dismiss(id);
      }, durationMs);
    },
    [dismiss]
  );

  useEffect(() => {
    globalToastListener = notify;
    return () => {
      if (globalToastListener === notify) {
        globalToastListener = null;
      }
    };
  }, [notify]);

  const contextValue: ToastContextValue = {
    notify,
    toast: notify,
    success: (title, message) => notify({ variant: 'success', title, message }),
    error: (title, message) => notify({ variant: 'error', title, message, durationMs: 5000 }),
    warning: (title, message) => notify({ variant: 'warning', title, message }),
    info: (title, message) => notify({ variant: 'info', title, message }),
    attention: (title, message) => notify({ variant: 'attention', title, message }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 w-[360px] max-w-[calc(100vw-2rem)] pointer-events-none no-print"
        aria-live="polite"
        data-testid="global-toast-container"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => {
            const resolvedVariant: ToastVariant = item.variant || item.type || 'info';
            const meta = VARIANT_META[resolvedVariant];
            const Icon = meta.Icon;
            const durationSec = (item.durationMs ?? 4200) / 1000;
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, x: 48, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 48, scale: 0.95 }}
                transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                style={{ borderLeftWidth: '4px', borderLeftColor: meta.borderHex }}
                className="glass-toast pointer-events-auto relative overflow-hidden p-3.5 flex items-start gap-3"
                data-testid={`toast-item-${item.variant}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBgClass}`}>
                  <Icon className={`w-4 h-4 ${meta.iconColorClass}`} />
                </div>
                <div className="flex-1 min-w-0 pr-1">
                  <p className="text-[14px] font-semibold text-[var(--text-primary)] leading-snug">
                    {item.title}
                  </p>
                  {(item.message || item.description) && (
                    <p className="text-[12.5px] font-medium text-[var(--text-secondary)] mt-0.5 leading-relaxed break-words">
                      {item.message || item.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors shrink-0"
                  aria-label="Fechar notificação"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <motion.div
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: durationSec, ease: 'linear' }}
                  style={{ transformOrigin: 'left' }}
                  className={`absolute bottom-0 left-0 right-0 h-[3px] ${meta.barClass} opacity-80`}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      notify: (t) => emitGlobalToast(t),
      toast: (t) => emitGlobalToast(t),
      success: (title, message) => emitGlobalToast({ variant: 'success', title, message }),
      error: (title, message) => emitGlobalToast({ variant: 'error', title, message }),
      warning: (title, message) => emitGlobalToast({ variant: 'warning', title, message }),
      info: (title, message) => emitGlobalToast({ variant: 'info', title, message }),
      attention: (title, message) => emitGlobalToast({ variant: 'attention', title, message }),
      dismiss: () => {},
    };
  }
  return ctx;
}

/* ============================================================================
   COUNT UP NUMBER COMPONENT (600ms - 900ms cubic-out animation)
   ============================================================================ */

interface CountUpNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  className?: string;
  formatter?: (val: number) => string;
}

export const CountUpNumber: React.FC<CountUpNumberProps> = ({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  durationMs = 720,
  className = '',
  formatter,
}) => {
  const [displayValue, setDisplayValue] = useState<number>(value);
  const previousValueRef = useRef<number>(0);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setDisplayValue(target);
      previousValueRef.current = target;
      return;
    }

    const startValue = previousValueRef.current;
    const delta = target - startValue;
    if (Math.abs(delta) < 0.001) {
      setDisplayValue(target);
      return;
    }

    let startTime: number | null = null;
    let rafId: number;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Cubic-bezier ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + delta * eased;
      setDisplayValue(current);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setDisplayValue(target);
        previousValueRef.current = target;
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [value, durationMs]);

  const formatted = formatter
    ? formatter(displayValue)
    : decimals > 0
      ? displayValue.toFixed(decimals).replace('.', ',')
      : Math.round(displayValue).toLocaleString('pt-BR');

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};

/* ============================================================================
   SMART AVATAR COMPONENT (Iniciais dinâmicas ou Foto + Dot de Status)
   ============================================================================ */

/* ============================================================================
   SINCRONIZAÇÃO GLOBAL DE FOTOS DO CADASTRO DE ALUNOS + SMART AVATAR
   ============================================================================ */

export type AvatarStatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'none';

const STUDENT_PHOTO_STORAGE_KEY = 'microlins_student_photos_v1';
const STUDENT_PHOTO_EVENT_NAME = 'microlins-student-photo-updated';

let memoryPhotoCache: Record<string, string> | null = null;

function readPhotoRegistryFromStorage(): Record<string, string> {
  if (typeof window === 'undefined') return memoryPhotoCache || {};
  try {
    const raw = window.localStorage.getItem(STUDENT_PHOTO_STORAGE_KEY);
    if (!raw) {
      return memoryPhotoCache || {};
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      memoryPhotoCache = parsed;
      return parsed;
    }
    return memoryPhotoCache || {};
  } catch {
    return memoryPhotoCache || {};
  }
}

export function getStudentRegisteredPhoto(
  contrato?: string | number | null,
  explicitPhotoUrl?: string | null
): string | null {
  if (explicitPhotoUrl && explicitPhotoUrl.trim()) {
    return explicitPhotoUrl.trim();
  }
  if (contrato === undefined || contrato === null) return null;
  const key = String(contrato).trim();
  if (!key) return null;
  const registry = readPhotoRegistryFromStorage();
  return registry[key] || null;
}

export function saveStudentRegisteredPhoto(
  contrato: string | number,
  photoDataUrl: string
): void {
  const key = String(contrato).trim();
  if (!key) return;
  const registry = { ...readPhotoRegistryFromStorage() };
  if (photoDataUrl && photoDataUrl.trim()) {
    registry[key] = photoDataUrl.trim();
  } else {
    delete registry[key];
  }
  memoryPhotoCache = registry;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STUDENT_PHOTO_STORAGE_KEY, JSON.stringify(registry));
    } catch {
      // Ignore storage quota errors
    }
    window.dispatchEvent(
      new CustomEvent(STUDENT_PHOTO_EVENT_NAME, {
        detail: { contrato: key, photoUrl: registry[key] || null },
      })
    );
  }
}

export function useStudentPhoto(
  contrato?: string | number | null,
  explicitPhotoUrl?: string | null
): [string | null, (dataUrl: string) => void] {
  const [photoUrl, setPhotoUrl] = useState<string | null>(() =>
    getStudentRegisteredPhoto(contrato, explicitPhotoUrl)
  );

  useEffect(() => {
    setPhotoUrl(getStudentRegisteredPhoto(contrato, explicitPhotoUrl));
  }, [contrato, explicitPhotoUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePhotoUpdate = () => {
      setPhotoUrl(getStudentRegisteredPhoto(contrato, explicitPhotoUrl));
    };
    window.addEventListener(STUDENT_PHOTO_EVENT_NAME, handlePhotoUpdate);
    window.addEventListener('storage', handlePhotoUpdate);
    return () => {
      window.removeEventListener(STUDENT_PHOTO_EVENT_NAME, handlePhotoUpdate);
      window.removeEventListener('storage', handlePhotoUpdate);
    };
  }, [contrato, explicitPhotoUrl]);

  const updatePhoto = useCallback(
    (newDataUrl: string) => {
      if (contrato !== undefined && contrato !== null && String(contrato).trim()) {
        saveStudentRegisteredPhoto(contrato, newDataUrl);
      }
      setPhotoUrl(newDataUrl || null);
    },
    [contrato]
  );

  return [photoUrl, updatePhoto];
}

interface SmartAvatarProps {
  name: string;
  contrato?: string | number | null;
  photoUrl?: string | null;
  status?: AvatarStatusTone;
  statusDot?: AvatarStatusTone;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function extractInitials(fullName: string): string {
  const cleaned = String(fullName || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return 'ML';
  const parts = cleaned.split(' ').filter((p) => p.length > 1 || partsSingle(cleaned));
  if (parts.length === 0) return cleaned.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function partsSingle(str: string): boolean {
  return str.split(' ').length === 1;
}

const AVATAR_SIZES: Record<NonNullable<SmartAvatarProps['size']>, { box: string; dot: string }> = {
  xs: { box: 'w-7 h-7 text-[11px]', dot: 'w-2 h-2 -bottom-0.5 -right-0.5' },
  sm: { box: 'w-8 h-8 text-[12px]', dot: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5' },
  md: { box: 'w-10 h-10 text-[13px]', dot: 'w-3 h-3 bottom-0 right-0' },
  lg: { box: 'w-12 h-12 text-[15px]', dot: 'w-3.5 h-3.5 bottom-0 right-0' },
  xl: { box: 'w-16 h-16 text-[18px]', dot: 'w-4 h-4 bottom-0.5 right-0.5' },
};

const STATUS_DOT_CLASSES: Record<Exclude<AvatarStatusTone, 'none'>, string> = {
  success: 'bg-[#16A34A]',
  warning: 'bg-[#F59E0B]',
  error: 'bg-[#DC2626]',
  info: 'bg-[#2563EB]',
  neutral: 'bg-slate-400',
};

export const SmartAvatar: React.FC<SmartAvatarProps> = ({
  name,
  contrato,
  photoUrl,
  status,
  statusDot,
  size = 'md',
  className = '',
}) => {
  const [resolvedPhotoUrl] = useStudentPhoto(contrato, photoUrl);
  const initials = extractInitials(name);
  const sizeSpec = AVATAR_SIZES[size];
  const resolvedStatus = status ?? statusDot;

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      {resolvedPhotoUrl ? (
        <img
          src={resolvedPhotoUrl}
          alt={name}
          className={`${sizeSpec.box} rounded-full object-cover object-center border border-white/60 dark:border-slate-700 shadow-xs`}
        />
      ) : (
        <div
          className={`${sizeSpec.box} rounded-full bg-gradient-to-br from-[#2563EB] to-[#6366F1] text-white font-bold tracking-tight flex items-center justify-center border border-white/40 dark:border-slate-700/80 shadow-xs`}
          title={name}
        >
          {initials}
        </div>
      )}
      {resolvedStatus && resolvedStatus !== 'none' && (
        <span
          className={`absolute ${sizeSpec.dot} rounded-full ring-2 ring-white dark:ring-[#172033] ${STATUS_DOT_CLASSES[resolvedStatus]}`}
        />
      )}
    </div>
  );
};

interface StudentDocumentPhotoProps {
  name: string;
  contrato: string | number;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  dataTestId?: string;
  className?: string;
  showContractBadge?: boolean;
}

const DOC_PHOTO_SIZES: Record<
  NonNullable<StudentDocumentPhotoProps['size']>,
  { frame: string; avatar: string; label: string }
> = {
  sm: {
    frame: 'h-20 w-[60px]',
    avatar: 'h-9 w-9 text-xs',
    label: 'text-[8px]',
  },
  md: {
    frame: 'h-24 w-[72px]',
    avatar: 'h-11 w-11 text-sm',
    label: 'text-[8.5px]',
  },
  lg: {
    frame: 'h-28 w-[84px]',
    avatar: 'h-12 w-12 text-base',
    label: 'text-[9px]',
  },
};

export const StudentDocumentPhoto: React.FC<StudentDocumentPhotoProps> = ({
  name,
  contrato,
  photoUrl,
  size = 'md',
  dataTestId,
  className = '',
  showContractBadge = true,
}) => {
  const [resolvedPhotoUrl] = useStudentPhoto(contrato, photoUrl);
  const initials = extractInitials(name);
  const spec = DOC_PHOTO_SIZES[size];

  return (
    <div
      data-testid={dataTestId}
      data-student-contrato={String(contrato)}
      data-has-custom-photo={resolvedPhotoUrl ? 'true' : 'false'}
      className={`relative flex ${spec.frame} shrink-0 flex-col items-center justify-between overflow-hidden rounded-xl border border-slate-300/90 bg-gradient-to-b from-slate-50 to-slate-100/90 shadow-xs select-none dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 print:border-slate-300 print:from-slate-50 print:to-slate-100 ${className}`}
    >
      {resolvedPhotoUrl ? (
        <img
          src={resolvedPhotoUrl}
          alt={`Foto de ${name}`}
          className="h-full w-full object-cover object-center"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-between p-1.5 text-center">
          <span className="w-full truncate font-mono text-[7.5px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 print:text-slate-500">
            MICROLINS
          </span>
          <div
            className={`flex ${spec.avatar} items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[#2563EB] to-[#6366F1] font-extrabold tracking-tight text-white shadow-xs dark:border-slate-700`}
            title={`Identificação visual sincronizada de ${name}`}
          >
            {initials}
          </div>
          {showContractBadge ? (
            <span
              className={`w-full truncate rounded bg-[#004A8D]/10 px-1 py-0.5 font-mono ${spec.label} font-bold text-[#004A8D] tabular-nums dark:bg-sky-500/15 dark:text-sky-300 print:text-[#004A8D]`}
            >
              #{contrato}
            </span>
          ) : (
            <span
              className={`w-full truncate font-semibold uppercase tracking-wider text-slate-400 ${spec.label}`}
            >
              FOTO 3x4
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   SHIMMER SKELETON LOADERS
   ============================================================================ */

export const BentoGridSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="bento-skeleton">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="w-28 h-4 shimmer-skeleton" />
          <div className="w-9 h-9 rounded-xl shimmer-skeleton" />
        </div>
        <div className="w-24 h-8 shimmer-skeleton" />
        <div className="w-40 h-3.5 shimmer-skeleton" />
      </div>
    ))}
  </div>
);

export const KanbanBoardSkeleton: React.FC = () => (
  <div className="space-y-4" data-testid="kanban-skeleton">
    <BentoGridSkeleton />
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((col) => (
        <div
          key={col}
          className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] p-3.5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="w-24 h-5 shimmer-skeleton" />
            <div className="w-12 h-5 rounded-full shimmer-skeleton" />
          </div>
          {[0, 1, 2].map((card) => (
            <div key={card} className="glass-card p-3.5 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full shimmer-skeleton shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="w-3/4 h-4 shimmer-skeleton" />
                  <div className="w-1/2 h-3 shimmer-skeleton" />
                </div>
              </div>
              <div className="w-full h-3 shimmer-skeleton" />
              <div className="flex justify-between pt-1">
                <div className="w-16 h-4 shimmer-skeleton" />
                <div className="w-20 h-4 shimmer-skeleton" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const DataTableSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="surface-solid overflow-hidden p-4 space-y-3" data-testid="table-skeleton">
    <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
      <div className="w-48 h-5 shimmer-skeleton" />
      <div className="w-32 h-8 shimmer-skeleton" />
    </div>
    {Array.from({ length: rows }).map((_, idx) => (
      <div key={idx} className="flex items-center gap-4 py-2">
        <div className="w-9 h-9 rounded-full shimmer-skeleton shrink-0" />
        <div className="w-1/4 h-4 shimmer-skeleton" />
        <div className="w-1/5 h-4 shimmer-skeleton" />
        <div className="w-1/6 h-4 shimmer-skeleton" />
        <div className="flex-1 h-4 shimmer-skeleton" />
      </div>
    ))}
  </div>
);

/* ============================================================================
   SLIDE-OVER DRAWER (Filtros Avançados & Inspeção Lateral)
   ============================================================================ */

interface SlideOverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}

export const SlideOverDrawer: React.FC<SlideOverDrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  widthClass = 'max-w-md',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="slide-over-drawer-title"
          className="fixed inset-0 z-50 flex justify-end no-print"
          data-testid="slide-over-drawer"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
            className={`relative z-10 w-full ${widthClass} h-full glass-modal rounded-none rounded-l-2xl border-r-0 flex flex-col shadow-2xl`}
          >
            <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <div>
                <h2 id="slide-over-drawer-title" className="typo-title-section text-[18px]">{title}</h2>
                {subtitle && (
                  <p className="typo-meta text-[var(--text-secondary)] mt-0.5">{subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-slate-200/50 dark:hover:bg-slate-800/60 transition-colors"
                aria-label="Fechar painel lateral"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">{children}</div>
            {footer && (
              <div className="px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/60">
                {footer}
              </div>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
