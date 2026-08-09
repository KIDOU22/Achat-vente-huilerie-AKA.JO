import type { Periode } from './types';

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export { uid };

export function formatDateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

export function formatKg(n: number): string {
  return `${formatNumber(n)} kg`;
}

export function formatFCFA(n: number): string {
  return `${formatNumber(n)} F`;
}

export function formatTonnes(kg: number): string {
  return `${(kg / 1000).toFixed(2)} t`;
}

export function todayKey(): string {
  return dateKey(Date.now());
}

export function dateKey(ts: number): string {
  return new Date(ts).toDateString();
}

// --- Helpers période / synthèse (repris du prototype) ---
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function periodKey(date: Date, period: Periode): string {
  if (period === 'jour') return date.toDateString();
  if (period === 'semaine') return `${date.getFullYear()}-W${isoWeek(date)}`;
  if (period === 'mois') return `${date.getFullYear()}-${date.getMonth()}`;
  return `${date.getFullYear()}`;
}

export function periodLabel(date: Date, period: Periode): string {
  if (period === 'jour') return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  if (period === 'semaine') return `Sem ${isoWeek(date)}`;
  if (period === 'mois') return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  return `${date.getFullYear()}`;
}

function stepBack(date: Date, period: Periode): Date {
  const d = new Date(date);
  if (period === 'jour') d.setDate(d.getDate() - 1);
  else if (period === 'semaine') d.setDate(d.getDate() - 7);
  else if (period === 'mois') d.setMonth(d.getMonth() - 1);
  else d.setFullYear(d.getFullYear() - 1);
  return d;
}

const BUCKET_COUNT: Record<Periode, number> = { jour: 14, semaine: 10, mois: 12, annee: 5 };

export interface Bucket {
  key: string;
  label: string;
  achatPoids: number;
  achatMontant: number;
  ventePoids: number;
  venteMontant: number;
  transportRegimeMontant: number;
  transportHuileMontant: number;
}

export function buildBuckets(period: Periode): Bucket[] {
  const count = BUCKET_COUNT[period];
  const buckets: Bucket[] = [];
  let cursor = new Date();
  for (let i = 0; i < count; i++) {
    buckets.unshift({
      key: periodKey(cursor, period),
      label: periodLabel(cursor, period),
      achatPoids: 0,
      achatMontant: 0,
      ventePoids: 0,
      venteMontant: 0,
      transportRegimeMontant: 0,
      transportHuileMontant: 0,
    });
    cursor = stepBack(cursor, period);
  }
  return buckets;
}

export const PERIODE_LABELS: Record<Periode, string> = {
  jour: "aujourd'hui",
  semaine: 'cette semaine',
  mois: 'ce mois',
  annee: 'cette année',
};
