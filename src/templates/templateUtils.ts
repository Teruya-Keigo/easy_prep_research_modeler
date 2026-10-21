import type { RiskInfo } from '../domain/model';

export const toIsoTimestamp = (now: string | Date | undefined): string => {
  if (typeof now === 'string') {
    return now;
  }
  return (now ?? new Date()).toISOString();
};

export const noRisk = (): RiskInfo => ({ level: 'none' });
