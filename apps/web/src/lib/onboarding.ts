/**
 * Onboarding state management via localStorage.
 *
 * Tracks how many times each user has seen the onboarding modal
 * and whether they've permanently dismissed it.
 * Key is scoped per user: `taskboard_onboarding_v1_{userId}`
 */

interface OnboardingState {
  seenCount: number;
  dismissedForever: boolean;
}

const STORAGE_KEY_PREFIX = "taskboard_onboarding_v1_";

function getKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

const DEFAULT_STATE: OnboardingState = { seenCount: 0, dismissedForever: false };

/** Read the current onboarding state for a user. Returns defaults if nothing stored. */
export function getOnboardingState(userId: string): OnboardingState {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };

  try {
    const raw = localStorage.getItem(getKey(userId));
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return {
      seenCount: typeof parsed.seenCount === "number" ? parsed.seenCount : 0,
      dismissedForever:
        typeof parsed.dismissedForever === "boolean"
          ? parsed.dismissedForever
          : false,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/** Should the onboarding auto-show? True if seenCount < 3 AND not dismissed. */
export function shouldAutoShowOnboarding(userId: string): boolean {
  const state = getOnboardingState(userId);
  return !state.dismissedForever && state.seenCount < 3;
}

/** Increment the seen count by 1. Called once per login session. */
export function incrementSeenCount(userId: string): number {
  const state = getOnboardingState(userId);
  state.seenCount += 1;
  saveState(userId, state);
  return state.seenCount;
}

/** Mark onboarding as permanently dismissed. */
export function dismissOnboardingForever(userId: string): void {
  const state = getOnboardingState(userId);
  state.dismissedForever = true;
  saveState(userId, state);
}

function saveState(userId: string, state: OnboardingState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getKey(userId), JSON.stringify(state));
  } catch {
    // Silently fail (incognito, quota exceeded, etc.)
  }
}
