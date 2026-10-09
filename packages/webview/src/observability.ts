import { createLogger, isDebugEnabled } from './logger.js';
import type { InlineEditorOpenTrace } from './protocol/types.js';

type ObservabilityLevel = 'INFO' | 'DEBUG' | 'WARNING' | 'ERROR';
type HostLogLevel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
type ObservabilityReporter = (
  level: HostLogLevel,
  event: string,
  details?: Record<string, unknown>
) => void;

const logger = createLogger('OpenTrace');

let reporter: ObservabilityReporter | null = null;
let currentOpenTrace: InlineEditorOpenTrace | null = null;
let currentInitGeneration = 0;
let currentSessionId: string | null = null;

const toHostLevel = (level: ObservabilityLevel): HostLogLevel => {
  if (level === 'WARNING') {
    return 'WARN';
  }
  return level;
};

const withOpenTrace = (details?: Record<string, unknown>): Record<string, unknown> | undefined => {
  return {
    initGeneration: currentInitGeneration,
    sessionId: currentSessionId,
    seq: currentOpenTrace?.seq ?? null,
    openReason: currentOpenTrace?.reason ?? null,
    targetUri: currentOpenTrace?.targetUri ?? null,
    ...(details ?? {}),
  };
};

export const setObservabilityReporter = (next: ObservabilityReporter | null): void => {
  reporter = next;
};

export const setCurrentOpenTrace = (
  next: InlineEditorOpenTrace | null,
  generation = currentInitGeneration + 1,
  sessionId: string | null = null
): void => {
  currentOpenTrace = next;
  currentInitGeneration = generation;
  currentSessionId = sessionId;
};

/** Cancel probes from an earlier init/reset, including delayed hidden-tab RAFs. */
export const scheduleObservabilityCallback = (
  callback: () => void,
  frames: number,
  scheduleFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame
): void => {
  if (!isDebugEnabled()) {return;}
  const generation = currentInitGeneration;
  const sessionId = currentSessionId;
  const run = (remaining: number): void => {
    if (!isDebugEnabled() || generation !== currentInitGeneration || sessionId !== currentSessionId) {return;}
    if (remaining <= 0) {callback(); return;}
    scheduleFrame(() => run(remaining - 1));
  };
  run(frames);
};

export const getCurrentOpenTrace = (): InlineEditorOpenTrace | null => {
  return currentOpenTrace;
};

export const logObservabilityEvent = (
  level: ObservabilityLevel,
  event: string,
  details?: Record<string, unknown>
): void => {
  if (!isDebugEnabled() && (level === 'INFO' || level === 'DEBUG')) {return;}
  const payload = withOpenTrace(details);
  switch (level) {
    case 'INFO':
      logger.info(event, payload);
      break;
    case 'DEBUG':
      logger.debug(event, payload);
      break;
    case 'WARNING':
      logger.warn(event, payload);
      break;
    case 'ERROR':
      logger.error(event, payload);
      break;
  }
  reporter?.(toHostLevel(level), event, payload);
};
