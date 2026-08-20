export type DatrixOpsEdition = 'community' | 'cloud';
export type DeploymentMode = 'self-hosted' | 'managed';

export function getEdition(): DatrixOpsEdition {
  return process.env.NEXT_PUBLIC_DATRIXOPS_EDITION === 'cloud' ? 'cloud' : 'community';
}

export function isCommunityEdition(): boolean {
  return getEdition() === 'community';
}

export function isCloudEdition(): boolean {
  return getEdition() === 'cloud';
}

export function editionLabel(edition?: string) {
  return (edition ?? getEdition()) === 'cloud' ? 'DatrixOps Cloud' : 'Community Edition';
}

export const APP_VERSION = process.env.NEXT_PUBLIC_DATRIXOPS_VERSION || '1.7.5';

export function getAppVersion(): string {
  return APP_VERSION;
}

export function deploymentLabel(mode?: string) {
  return mode === 'managed' ? 'Managed' : 'Self-hosted';
}

export function dataOwnershipLabel(value?: string) {
  return value === 'provider-managed' ? 'Provider managed' : 'Customer controlled';
}
