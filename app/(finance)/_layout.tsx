import { Tabs } from 'expo-router';
import { CalendarRange, LayoutDashboard, ListTree } from 'lucide-react-native';
import React from 'react';
import { FinanceHeader } from '../../src/components/FinanceHeader';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/typography';

export default function FinanceLayout() {
  return (
    <Tabs
      screenOptions={{
        header: () => <FinanceHeader />,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.backgroundAlt,
          borderTopColor: colors.borderSubtle,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 10 },
        tabBarActiveTintColor: colors.onBackground,
        tabBarInactiveTintColor: colors.onBackgroundFaint,
      }}
    >
      <Tabs.Screen
        name="tableau-de-bord"
        options={{ title: 'Tableau de bord', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="budget"
        options={{ title: 'Budget', tabBarIcon: ({ color, size }) => <CalendarRange color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="tresorerie"
        options={{ title: 'Trésorerie', tabBarIcon: ({ color, size }) => <ListTree color={color} size={size} /> }}
      />
    </Tabs>
  );
}
