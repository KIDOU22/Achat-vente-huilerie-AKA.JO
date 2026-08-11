import { useSQLiteContext } from 'expo-sqlite';
import { Plus, RotateCcw, ShieldCheck, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/TextField';
import { changeUserRole, createUser, listUsers, reinitialiserAcces, revokeUser } from '../db/repositories/users';
import { getCaisseForUser } from '../db/repositories/caisses';
import { logAudit } from '../db/repositories/audit';
import { ROLE_LABELS, type Role, type User } from '../domain/types';
import { syncUpdateProfile } from '../sync/auth';
import { pushCaisse } from '../sync/push';
import { colors, roleColors } from '../theme/colors';
import { fonts } from '../theme/typography';

const ROLE_OPTIONS: Role[] = ['gerant', 'agent'];

export function ComptesScreen() {
  const db = useSQLiteContext();
  const { currentUser, isManager } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [nom, setNom] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetIdentifiant, setResetIdentifiant] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  const refresh = useCallback(async () => {
    const all = await listUsers(db);
    setUsers(all.filter((u) => u.actif));
  }, [db]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  if (!isManager) {
    return (
      <View style={styles.locked}>
        <Text style={styles.lockedText}>Accès réservé au gérant</Text>
      </View>
    );
  }

  async function handleAdd() {
    if (!nom.trim() || !identifiant.trim() || !code.trim() || !currentUser) return;
    setSaving(true);
    setError('');
    try {
      const existing = await listUsers(db);
      if (existing.some((u) => u.identifiant.toLowerCase() === identifiant.trim().toLowerCase())) {
        setError('Cet identifiant existe déjà.');
        return;
      }
      const user = await createUser(db, { nom, identifiant, code, role });
      const caisse = await getCaisseForUser(db, user.id);
      if (caisse) pushCaisse(caisse).catch(() => {});
      await logAudit(db, {
        userId: currentUser.id,
        userNom: currentUser.nom,
        action: 'create',
        entity: 'user',
        entityId: user.id,
        details: `Création du compte ${identifiant} (${ROLE_LABELS[role]})`,
      });
      setNom('');
      setIdentifiant('');
      setCode('');
      setRole('agent');
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(user: User) {
    if (!currentUser) return;
    await revokeUser(db, user.id);
    await logAudit(db, {
      userId: currentUser.id,
      userNom: currentUser.nom,
      action: 'revoke',
      entity: 'user',
      entityId: user.id,
      details: `Révocation de l'accès de ${user.identifiant}`,
    });
    await refresh();
    syncUpdateProfile(user.identifiant, { actif: false }).catch(() => {});
  }

  function openReset(user: User) {
    setResetTarget(user);
    setResetIdentifiant(user.identifiant);
    setResetCode('');
    setResetError('');
  }

  async function handleReset() {
    if (!resetTarget || !currentUser || !resetIdentifiant.trim() || !resetCode.trim()) return;
    setResetSaving(true);
    setResetError('');
    try {
      const result = await reinitialiserAcces(db, resetTarget.id, { identifiant: resetIdentifiant, code: resetCode });
      if ('error' in result) {
        setResetError(result.error);
        return;
      }
      const caisse = await getCaisseForUser(db, result.id);
      if (caisse) pushCaisse(caisse).catch(() => {});
      await logAudit(db, {
        userId: currentUser.id,
        userNom: currentUser.nom,
        action: 'reinitialiser_acces',
        entity: 'user',
        entityId: resetTarget.id,
        details: `Accès réinitialisé pour ${resetTarget.nom}`,
      });
      setResetTarget(null);
      await refresh();
    } finally {
      setResetSaving(false);
    }
  }

  async function handleChangeRole(user: User, newRole: Role) {
    if (!currentUser || user.id === currentUser.id) return;
    await changeUserRole(db, user.id, newRole);
    await logAudit(db, {
      userId: currentUser.id,
      userNom: currentUser.nom,
      action: 'change_role',
      entity: 'user',
      entityId: user.id,
      details: `Rôle changé pour ${ROLE_LABELS[newRole]}`,
    });
    await refresh();
    syncUpdateProfile(user.identifiant, { role: newRole }).catch(() => {});
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Card style={{ gap: 10 }}>
        <Text style={styles.cardTitle}>Nouvel utilisateur</Text>
        <Text style={styles.resetHint}>
          Identifiant et code provisoires — l'utilisateur devra créer les siens (personnels) à sa première connexion.
        </Text>
        <TextField label="Nom complet" value={nom} onChangeText={setNom} placeholder="Nom complet" />
        <View style={styles.grid2}>
          <View style={{ flex: 1 }}>
            <TextField label="Identifiant provisoire" value={identifiant} onChangeText={setIdentifiant} placeholder="Identifiant" autoCapitalize="none" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Code provisoire" value={code} onChangeText={setCode} placeholder="Code d'accès" mono keyboardType="number-pad" secureTextEntry />
          </View>
        </View>
        <View>
          <Text style={styles.fieldLabel}>Niveau de responsabilité</Text>
          <View style={styles.grid2}>
            {ROLE_OPTIONS.map((r) => {
              const active = role === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  style={[
                    styles.roleChip,
                    active ? { backgroundColor: roleColors[r] } : styles.roleChipInactive,
                  ]}
                >
                  <Text style={[styles.roleChipText, { color: active ? colors.onBackground : colors.textMuted }]}>
                    {ROLE_LABELS[r]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button
          label="Ajouter"
          onPress={handleAdd}
          disabled={!nom.trim() || !identifiant.trim() || !code.trim()}
          loading={saving}
          color={colors.frond}
          icon={<Plus size={16} color={colors.onBackground} />}
        />
      </Card>

      <View style={{ gap: 8, marginTop: 16 }}>
        {!loading &&
          users.map((u) => (
            <Card key={u.id} style={{ gap: 10 }}>
              <View style={styles.userRow}>
                <View style={styles.userInfoRow}>
                  <View style={[styles.avatar, { backgroundColor: `${roleColors[u.role]}33` }]}>
                    <ShieldCheck size={14} color={roleColors[u.role]} />
                  </View>
                  <View>
                    <Text style={styles.userName}>{u.nom}</Text>
                    <Text style={styles.userIdentifiant}>{u.identifiant}</Text>
                    {u.doitChangerCode && <Text style={styles.pendingBadge}>En attente de configuration par l'utilisateur</Text>}
                  </View>
                </View>
                <View style={styles.userActions}>
                  <Pressable onPress={() => openReset(u)} hitSlop={10}>
                    <RotateCcw size={16} color={colors.textMuted} />
                  </Pressable>
                  {u.id !== currentUser?.id && (
                    <Pressable onPress={() => handleRevoke(u)} hitSlop={10}>
                      <X size={16} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              </View>
              <View style={styles.grid2}>
                {ROLE_OPTIONS.map((r) => {
                  const active = u.role === r;
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <Pressable
                      key={r}
                      disabled={isSelf}
                      onPress={() => handleChangeRole(u, r)}
                      style={[
                        styles.roleChipSmall,
                        active ? { backgroundColor: roleColors[r] } : styles.roleChipSmallInactive,
                        isSelf && { opacity: 0.4 },
                      ]}
                    >
                      <Text style={[styles.roleChipSmallText, { color: active ? colors.onBackground : colors.textMuted }]}>
                        {ROLE_LABELS[r]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {resetTarget?.id === u.id && (
                <View style={styles.resetForm}>
                  <Text style={styles.resetTitle}>Réinitialiser l'accès de {u.nom}</Text>
                  <Text style={styles.resetHint}>
                    Ces identifiant/code sont provisoires : {u.nom} devra en créer de nouveaux, personnels, à sa
                    prochaine connexion.
                  </Text>
                  <View style={styles.grid2}>
                    <View style={{ flex: 1 }}>
                      <TextField
                        label="Identifiant provisoire"
                        value={resetIdentifiant}
                        onChangeText={setResetIdentifiant}
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextField
                        label="Code provisoire"
                        value={resetCode}
                        onChangeText={setResetCode}
                        mono
                        keyboardType="number-pad"
                        secureTextEntry
                      />
                    </View>
                  </View>
                  {!!resetError && <Text style={styles.error}>{resetError}</Text>}
                  <View style={styles.grid2}>
                    <Button
                      label="Annuler"
                      variant="outline"
                      color={colors.textMuted}
                      onPress={() => setResetTarget(null)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Réinitialiser"
                      onPress={handleReset}
                      loading={resetSaving}
                      disabled={!resetIdentifiant.trim() || !resetCode.trim()}
                      color={colors.amber}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              )}
            </Card>
          ))}
      </View>

      <Text style={styles.footnote}>
        Seul le gérant peut créer un compte, changer un niveau de responsabilité ou révoquer un accès. Le niveau «
        Gérant » est seul autorisé à définir et consulter le prix de vente de l'huile et les montants associés.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 60 },
  locked: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  lockedText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.onBackground },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 6,
  },
  grid2: { flexDirection: 'row', gap: 8 },
  roleChip: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  roleChipInactive: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  roleChipText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  error: { color: colors.accent, fontFamily: fonts.body, fontSize: 13 },
  userRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  userName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  userIdentifiant: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint },
  userActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pendingBadge: { fontFamily: fonts.body, fontSize: 10, color: colors.amber, marginTop: 2 },
  resetForm: {
    gap: 10,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  resetTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  resetHint: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, lineHeight: 15 },
  roleChipSmall: { flex: 1, borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
  roleChipSmallInactive: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  roleChipSmallText: { fontFamily: fonts.bodyMedium, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  footnote: { fontFamily: fonts.body, fontSize: 11, color: colors.onBackgroundMuted, marginTop: 16, lineHeight: 16 },
});
