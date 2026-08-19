import { settings } from '@devvit/web/server';
import type { WorldEnvironment } from '../../shared/contracts.js';

export type AppConfig = {
  appId: string;
  rpId: string;
  action: string;
  environment: WorldEnvironment;
  signingKey: string;
  signalSecret: string;
};

async function requiredSetting(name: string): Promise<string> {
  const value = await settings.get<string>(name);
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`Missing required app setting: ${name}`);
  return trimmed;
}

export async function getAppConfig(): Promise<AppConfig> {
  const environment =
    (await settings.get<WorldEnvironment>('worldEnvironment')) ?? 'production';
  const config: AppConfig = {
    appId: await requiredSetting('worldAppId'),
    rpId: await requiredSetting('worldRpId'),
    action: (await settings.get<string>('worldAction'))?.trim() || 'reddit-human-selfie-v1',
    environment,
    signingKey: await requiredSetting('worldRpSigningKey'),
    signalSecret: await requiredSetting('signalHmacSecret'),
  };
  if (!config.appId.startsWith('app_')) throw new Error('worldAppId must start with app_');
  if (!config.rpId.startsWith('rp_')) throw new Error('worldRpId must start with rp_');
  if (!['production', 'staging'].includes(config.environment)) {
    throw new Error('worldEnvironment must be production or staging');
  }
  if (config.signalSecret.length < 32) throw new Error('signalHmacSecret must be at least 32 characters');
  return config;
}

export async function isConfigured(): Promise<boolean> {
  try {
    await getAppConfig();
    return true;
  } catch {
    return false;
  }
}

export async function isEnabled(): Promise<boolean> {
  return (await settings.get<boolean>('enabled')) ?? true;
}
