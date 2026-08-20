export function shouldValidateAuthToken(
  token: string | null,
  validatedReplacementToken: string | null,
): boolean {
  return Boolean(token) && token !== validatedReplacementToken;
}
