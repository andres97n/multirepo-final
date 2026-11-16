import type { AppConfig as AppConfigShape } from './env.schema';

export const APP_CONFIG = Symbol('APP_CONFIG');

export type AppConfig = AppConfigShape;
