import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '../src/auth/AuthContext';

export default function Index() {
  const { currentUser, isElevated } = useAuth();
  if (!currentUser) return <Redirect href="/login" />;
  // Gérant/Dirigeant choisissent leur module de destination (Achats/Ventes ou
  // Finance & Comptabilité) depuis le hub ; un agent n'a qu'une seule destination
  // possible et continue d'y aller directement, comme avant.
  return <Redirect href={isElevated ? '/hub' : '/achat'} />;
}
