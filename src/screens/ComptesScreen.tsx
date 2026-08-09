import { useSQLiteContext } from 'expo-sqlite';
import { Plus, ShieldCheck, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/TextField';
import { changeUserRole, createUser, listUsers, revokeUser } from '../db/repositories/users';
import { logAudit } from '../db/repositories/audit';
import { ROLE_LABELS, type Role, type User } from '../domain/types';
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
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Card style={{ gap: 10 }}>
        <Text style={styles.cardTitle}>Nouvel utilisateur</Text>
        <TextField label="Nom complet" value={nom} onChangeText={setNom} placeholder="Nom complet" />
        <View style={styles.grid2}>
          <View style={{ flex: 1 }}>
            <TextField label="Identifiant" value={identifiant} onChangeText={setIdentifiant} placeholder="Identifiant" autoCapitalize="none" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Code d'accès" value={code} onChangeText={setCode} placeholder="Code d'accès" mono keyboardType="number-pad" secureTextEntry />
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
                  </View>
                </View>
                {u.id !== currentUser?.id && (
                  <Pressable onPress={() => handleRevoke(u)} hitSlop={10}>
                    <X size={16} color={colors.textMuted} />
                  </Pressable>
                )}
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
  roleChipSmall: { flex: 1, borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
  roleChipSmallInactive: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  roleChipSmallText: { fontFamily: fonts.bodyMedium, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  footnote: { fontFamily: fonts.body, fontSize: 11, color: colors.onBackgroundMuted, marginTop: 16, lineHeight: 16 },
});
