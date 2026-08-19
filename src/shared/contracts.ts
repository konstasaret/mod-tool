export type VerificationStatus = 'none' | 'pending' | 'verified' | 'failed';
export type VerificationLevel = 'selfie' | 'orb';
export type WorldEnvironment = 'production' | 'staging';

export type RpContext = {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
};

export type PortalState = {
  signedIn: boolean;
  enabled: boolean;
  setupComplete: boolean;
  status: VerificationStatus;
  level?: VerificationLevel;
  requestedAt?: string;
  verifiedAt?: string;
  message: string;
  humanBadgeStatus: VerificationStatus;
  humanBadgeRequestedAt?: string;
  humanBadgeVerifiedAt?: string;
};

export type StartVerificationResponse =
  | { ok: true; launchUrl: string; expiresAt: number }
  | { ok: true; session: DirectVerificationSession }
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
  verificationLevel?: VerificationLevel;
};

export type BridgePublicSession = Omit<BridgeSessionInput, 'callbackUrl' | 'requestId'> & {
  expiresAt: number;
};

export type DirectVerificationSession = Omit<BridgeSessionInput, 'callbackUrl'> & {
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
