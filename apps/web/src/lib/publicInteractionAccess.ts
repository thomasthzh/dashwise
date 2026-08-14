export function shouldEnableProtectedSearch(open: boolean, disabled = false) {
  return open && !disabled;
}

export function shouldPollPageIntegrations(token: string | null, readOnly = false) {
  return Boolean(token) && !readOnly;
}
