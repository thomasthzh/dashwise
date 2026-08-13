export function resolveLoginIdentifier(
  identifier: string,
  admin: { alias?: string; email?: string },
) {
  const normalized = identifier.trim();
  const alias = admin.alias?.trim();
  const email = admin.email?.trim();
  return alias && email && normalized.toLowerCase() === alias.toLowerCase()
    ? email
    : normalized;
}
