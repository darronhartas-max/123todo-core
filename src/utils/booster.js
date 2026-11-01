import { STORAGE_KEYS } from './constants';

/**
 * 123 To Do (Community Core Edition) — Resource Quotas & Limits
 *
 * Open-Source Community Baseline:
 * - 2 photos per note / task
 * - Up to 7 active custom projects
 * - Up to 7 subtasks per task
 * - 90-day completed task search indexing (non-destructive; older tasks remain preserved)
 * - Polite 60-second cloud sync with instant pull on app launch and pull-to-refresh
 */
export const FREE_LIMITS = {
  MAX_PHOTOS_PER_NOTE: 2,
  MAX_PROJECTS: 7,
  MAX_SUBTASKS_PER_TASK: 7,
  ARCHIVE_SEARCH_DAYS: 90,
  POLLING_INTERVAL: 60000,
  DEBOUNCE_DELAY: 800
};

export const BOOSTER_LIMITS = {
  MAX_PHOTOS_PER_NOTE: 15,
  MAX_PROJECTS: Infinity,
  MAX_SUBTASKS_PER_TASK: Infinity,
  ARCHIVE_SEARCH_DAYS: Infinity,
  POLLING_INTERVAL: 8000,
  DEBOUNCE_DELAY: 150
};

export const isBoosterActive = () => false;

export const getBoosterLicenseInfo = () => null;

export const initBooster = async () => false;

export const activateBoosterLicense = async () => ({
  success: false,
  error: 'Booster license verification is enabled on the official production app at app.123todo.com.'
});

export const deactivateBoosterLicense = () => true;

// Aliases for interface compatibility
export const enableBoosterMode = activateBoosterLicense;
export const disableBoosterMode = deactivateBoosterLicense;

/**
 * Returns the maximum allowed photos per note/task.
 */
export const getMaxPhotosPerNote = () => FREE_LIMITS.MAX_PHOTOS_PER_NOTE;

/**
 * Returns the maximum allowed custom projects.
 */
export const getMaxProjects = () => FREE_LIMITS.MAX_PROJECTS;

/**
 * Returns the maximum allowed subtasks per task.
 */
export const getMaxSubtasksPerTask = () => FREE_LIMITS.MAX_SUBTASKS_PER_TASK;

/**
 * Checks whether an archived task is within the visible search window.
 * Community tier: tasks completed within the last 90 days.
 */
export const isWithinArchiveSearchLimit = (task) => {
  if (!task || !task.completedAt) return true;

  const completedTime = typeof task.completedAt === 'string'
    ? new Date(task.completedAt).getTime()
    : Number(task.completedAt);

  if (isNaN(completedTime)) return true;

  const ninetyDaysMs = FREE_LIMITS.ARCHIVE_SEARCH_DAYS * 24 * 60 * 60 * 1000;
  return (Date.now() - completedTime) <= ninetyDaysMs;
};
