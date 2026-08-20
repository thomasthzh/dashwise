export function resolvePageConfigAuthScope(
  token: string | null,
  userId: string | null | undefined,
): string | null {
  if (!token) return null;
  return userId ? `user:${userId}` : `session:${token}`;
}
