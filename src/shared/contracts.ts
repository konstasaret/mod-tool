export type VerificationStatus = 'none' | 'pending' | 'verified' | 'failed';
export type VerificationLevel = 'orb';
export type WorldEnvironment = 'production' | 'staging';

export type RpContext = {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
};

export type PortalState = {
  enabled: boolean;
  setupComplete: boolean;
  status: VerificationStatus;
  level?: VerificationLevel;
  requestedAt?: string;
  verifiedAt?: string;
  message: string;
};

export type StartVerificationResponse =
  | { ok: true; launchUrl: string; expiresAt: number }
  | { ok: false; error: string };

export type BridgeSessionInput = {
  requestId: string;
  appId: string;
  rpId: string;
  action: string;
  signal: string;
  rpContext: RpContext;
  environment: WorldEnvironment;
  callbackUrl: string;
};

export type BridgePublicSession = Omit<BridgeSessionInput, 'callbackUrl' | 'requestId'> & {
  expiresAt: number;
};

export type IdKitResponseItem = {
  identifier?: string;
  signal_hash?: string;
  nullifier?: string;
  [key: string]: unknown;
};

export type IdKitResponse = {
  protocol_version?: string;
  nonce?: string;
  action?: string;
  environment?: string;
  responses?: IdKitResponseItem[];
  [key: string]: unknown;
};
