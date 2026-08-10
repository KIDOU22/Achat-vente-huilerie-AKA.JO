import { Tabs } from 'expo-router';
import { BarChart3, ClipboardList, Droplet, Scale, Users, Wallet } from 'lucide-react-native';
import React from 'react';
import { AppHeader } from '../../src/components/AppHeader';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/typography';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        header: () => <AppHeader />,
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
        name="achat"
        options={{ title: 'Achat', tabBarIcon: ({ color, size }) => <Scale color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="vente"
        options={{
          title: 'Vente',
          tabBarIcon: ({ color, size }) => <Droplet color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="synthese"
        options={{ title: 'Synthèse', tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="planteurs"
        options={{ title: 'Planteurs', tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="historique"
        options={{ title: 'Historique', tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="caisse"
        options={{ title: 'Caisse', tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} /> }}
      />
    </Tabs>
  );
}
