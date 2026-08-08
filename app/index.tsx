import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '../src/auth/AuthContext';

export default function Index() {
  const { currentUser } = useAuth();
  return <Redirect href={currentUser ? '/achat' : '/login'} />;
}
