import argon2 from "argon2";

/**
 * Password hashing with argon2id (memory-hard, resistant to GPU attacks).
 * Defaults from the argon2 library are sensible for interactive logins.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
