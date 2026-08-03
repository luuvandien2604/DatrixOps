export type DatrixOpsEdition = 'community' | 'cloud';
export type DeploymentMode = 'self-hosted' | 'managed';

export function editionLabel(edition?: string) {
  return edition === 'cloud' ? 'DatrixOps Cloud' : 'Community Edition';
}

export function deploymentLabel(mode?: string) {
  return mode === 'managed' ? 'Managed' : 'Self-hosted';
}

export function dataOwnershipLabel(value?: string) {
  return value === 'provider-managed' ? 'Provider managed' : 'Customer controlled';
}
