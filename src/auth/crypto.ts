import 'react-native-get-random-values';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

// Le code d'accès n'est jamais stocké en clair : uniquement son hash bcrypt.
export async function hashCode(code: string): Promise<string> {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(code, salt);
}

export async function verifyCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
