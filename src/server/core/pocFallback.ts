export function isDevvitDomainPermissionDenied(error: unknown, domain: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('PERMISSION_DENIED') &&
    message.includes(`domain: ${domain}`) &&
    message.includes('is not allowed')
  );
}
