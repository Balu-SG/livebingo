export type BroadcasterIdentity = { id: string; login: string };

export function isAllowedBroadcaster(
  candidate: BroadcasterIdentity,
  firstBroadcaster: BroadcasterIdentity | null,
  configuredLogin?: string,
) {
  const configured = configuredLogin?.trim().replace(/^@/, '').toLowerCase();
  if (configured) return candidate.login.toLowerCase() === configured;
  return !firstBroadcaster || candidate.id === firstBroadcaster.id;
}
