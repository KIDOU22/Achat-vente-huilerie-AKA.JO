import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import type { Bucket } from '../domain/format';
import type { Metrique } from '../domain/types';

interface BarChartProps {
  data: Bucket[];
  metrique: Metrique;
  height?: number;
}

const CHART_PADDING = 8;
const BAR_GROUP_GAP = 6;
const BAR_GAP = 3;

export function BarChart({ data, metrique, height = 200 }: BarChartProps) {
  const { achatKey, venteKey } = metrique === 'poids'
    ? { achatKey: 'achatPoids' as const, venteKey: 'ventePoids' as const }
    : { achatKey: 'achatMontant' as const, venteKey: 'venteMontant' as const };

  const max = useMemo(() => {
    let m = 0;
    for (const b of data) {
      m = Math.max(m, b[achatKey], b[venteKey]);
    }
    return m || 1;
  }, [data, achatKey, venteKey]);

  const groupWidth = 100 / Math.max(data.length, 1);

  return (
    <View>
      <View style={[styles.chartArea, { height }]}>
        <Svg width="100%" height={height}>
          <Line x1="0" y1={height - CHART_PADDING} x2="100%" y2={height - CHART_PADDING} stroke={colors.border} strokeWidth={1} />
          {data.map((b, i) => {
            const achatH = ((b[achatKey] / max) * (height - CHART_PADDING * 2)) || 0;
            const venteH = ((b[venteKey] / max) * (height - CHART_PADDING * 2)) || 0;
            const groupXPct = i * groupWidth;
            const barWidthPct = (groupWidth - BAR_GROUP_GAP) / 2;
            return (
              <React.Fragment key={b.key}>
                <Rect
                  x={`${groupXPct + BAR_GROUP_GAP / 2}%`}
                  y={height - CHART_PADDING - achatH}
                  width={`${Math.max(barWidthPct - BAR_GAP / 2, 0)}%`}
                  height={achatH}
                  rx={2}
                  fill={colors.accent}
                />
                <Rect
                  x={`${groupXPct + BAR_GROUP_GAP / 2 + barWidthPct + BAR_GAP / 2}%`}
                  y={height - CHART_PADDING - venteH}
                  width={`${Math.max(barWidthPct - BAR_GAP / 2, 0)}%`}
                  height={venteH}
                  rx={2}
                  fill={colors.oil}
                />
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
      <View style={styles.labelsRow}>
        {data.map((b) => (
          <Text key={b.key} style={styles.label} numberOfLines={1}>
            {b.label}
          </Text>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
          <Text style={styles.legendText}>Achats</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.oil }]} />
          <Text style={styles.legendText}>Ventes</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartArea: { width: '100%' },
  labelsRow: { flexDirection: 'row', marginTop: 6 },
  label: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textFaint,
  },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
});
