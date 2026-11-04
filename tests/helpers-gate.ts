import { isSourceAllowed, type GatingSettings } from '../src/main/trigger/gating';

export const gate = (cls: string | null, g: GatingSettings): boolean => isSourceAllowed(cls, g);
