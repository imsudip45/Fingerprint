export interface LearnerIdentity {
  learnerId: string;
  learnerName: string;
}

const STORAGE_KEY = 'fingerprint.identity.v1';

export const loadSavedLearnerIdentity = (): LearnerIdentity | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LearnerIdentity;
    if (!parsed?.learnerId || !parsed?.learnerName) return null;
    return {
      learnerId: String(parsed.learnerId),
      learnerName: String(parsed.learnerName),
    };
  } catch {
    return null;
  }
};

export const saveLearnerIdentity = (identity: LearnerIdentity) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
};

export const clearSavedLearnerIdentity = () => {
  window.localStorage.removeItem(STORAGE_KEY);
};
