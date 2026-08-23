import 'react-native-get-random-values';
import type { FinancePeriode, Periode } from './types';

// UUID v4 — même format que les colonnes "uuid" Supabase, pour synchroniser
// un enregistrement local et distant sous le même identifiant sans table de mapping.
export function uid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

// --- Helpers période module Finance (mois/trimestre/année — distinct de
// Periode ci-dessus, qui reste utilisé tel quel par Synthèse) ---
export function financePeriodKey(date: Date, period: FinancePeriode): string {
  if (period === 'mois') return `${date.getFullYear()}-${date.getMonth()}`;
  if (period === 'trimestre') return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
  return `${date.getFullYear()}`;
}

export function financePeriodLabel(date: Date, period: FinancePeriode): string {
  if (period === 'mois') return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  if (period === 'trimestre') return `T${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  return `${date.getFullYear()}`;
}

// Bornes [début, fin) en epoch ms de la période contenant `date`, pour filtrer
// des mouvements/lignes de budget par intervalle plutôt que par periodKey.
export function financePeriodBounds(date: Date, period: FinancePeriode): { start: number; end: number } {
  const year = date.getFullYear();
  if (period === 'mois') {
    const month = date.getMonth();
    return { start: new Date(year, month, 1).getTime(), end: new Date(year, month + 1, 1).getTime() };
  }
  if (period === 'trimestre') {
    const q = Math.floor(date.getMonth() / 3);
    return { start: new Date(year, q * 3, 1).getTime(), end: new Date(year, q * 3 + 3, 1).getTime() };
  }
  return { start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime() };
}

export const FINANCE_PERIODE_LABELS: Record<FinancePeriode, string> = {
  mois: 'ce mois',
  trimestre: 'ce trimestre',
  annee: 'cette année',
};
