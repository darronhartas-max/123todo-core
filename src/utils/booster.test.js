import {
  FREE_LIMITS,
  isBoosterActive,
  getMaxPhotosPerNote,
  getMaxProjects,
  getMaxSubtasksPerTask,
  isWithinArchiveSearchLimit
} from './booster';

describe('123 To Do Community Core limits', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('enforces Community Core limits', () => {
    expect(isBoosterActive()).toBe(false);
    expect(getMaxPhotosPerNote()).toBe(FREE_LIMITS.MAX_PHOTOS_PER_NOTE);
    expect(getMaxPhotosPerNote()).toBe(2);
    expect(getMaxProjects()).toBe(FREE_LIMITS.MAX_PROJECTS);
    expect(getMaxProjects()).toBe(7);
    expect(getMaxSubtasksPerTask()).toBe(FREE_LIMITS.MAX_SUBTASKS_PER_TASK);
    expect(getMaxSubtasksPerTask()).toBe(7);
  });

  test('isWithinArchiveSearchLimit respects 90-day window on community tier', () => {
    const now = Date.now();
    const recentTask = { id: 1, completedAt: now - (10 * 24 * 60 * 60 * 1000) }; // 10 days ago
    const oldTask = { id: 2, completedAt: now - (95 * 24 * 60 * 60 * 1000) };    // 95 days ago

    expect(isWithinArchiveSearchLimit(recentTask)).toBe(true);
    expect(isWithinArchiveSearchLimit(oldTask)).toBe(false);
  });
});
