import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfiguratorStore } from '@/stores/useConfiguratorStore';
import { useOpeningsStore } from '@/stores/useOpeningsStore';
import { HALL_COALESCE_MS, HISTORY_LIMIT, startHistoryRecording, useHistoryStore } from './useHistoryStore';

let stop: () => void;
const history = () => useHistoryStore.getState();
const hall = () => useConfiguratorStore.getState();
const openings = () => useOpeningsStore.getState();

/** A slider drag: many values in quick succession. */
function dragLength(values: number[]) {
  for (const v of values) {
    hall().setLength(v);
    vi.advanceTimersByTime(50);
  }
  vi.advanceTimersByTime(HALL_COALESCE_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  hall().resetConfigurator();
  openings().resetOpenings();
  stop = startHistoryRecording();
  history().reset();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('undo/redo history', () => {
  it('coalesces a slider drag into one entry', () => {
    dragLength([13, 15, 18, 21, 24]);
    expect(history().past).toHaveLength(1);
    history().undo();
    expect(hall().length).toBe(12);
    history().redo();
    expect(hall().length).toBe(24);
  });

  it('one entry per add, move (drag end) and remove of an opening', () => {
    const id = openings().addOpening({ type: 'window', wallId: 'PereteDR', offsetX: 2, sill: 1, width: 1, height: 1 });
    expect(history().past).toHaveLength(1);

    // A drag: many updates while dragging, one entry when it ends.
    openings().setIsDragging(true);
    for (const x of [2.5, 3, 3.5, 4]) openings().updateOpening(id, { offsetX: x });
    expect(history().past).toHaveLength(1);
    openings().setIsDragging(false);
    expect(history().past).toHaveLength(2);

    openings().removeOpening(id);
    expect(history().past).toHaveLength(3);
  });

  it('undoes and redoes a dimension change and an opening move, without recording itself', () => {
    const id = openings().addOpening({ type: 'window', wallId: 'PereteDR', offsetX: 2, sill: 1, width: 1, height: 1 });
    dragLength([18, 24]);
    openings().setIsDragging(true);
    openings().updateOpening(id, { offsetX: 14 });
    openings().setIsDragging(false);
    expect(history().past).toHaveLength(3);
    const moved = openings().openings[0].offsetX;

    history().undo(); // the move
    expect(openings().openings[0].offsetX).toBe(2);
    expect(hall().length).toBe(24);
    history().undo(); // the length
    expect(hall().length).toBe(12);
    vi.advanceTimersByTime(HALL_COALESCE_MS * 2);
    expect(history().past).toHaveLength(1);
    expect(history().future).toHaveLength(2);

    history().redo();
    history().redo();
    vi.advanceTimersByTime(HALL_COALESCE_MS * 2);
    expect(hall().length).toBe(24);
    expect(openings().openings[0].offsetX).toBe(moved);
    expect(history().past).toHaveLength(3);
    expect(history().canRedo).toBe(false);
  });

  it('a new action after an undo drops the redo branch', () => {
    dragLength([18]);
    history().undo();
    expect(history().canRedo).toBe(true);
    hall().setWidth(15);
    vi.advanceTimersByTime(HALL_COALESCE_MS);
    expect(history().canRedo).toBe(false);
    expect(history().past).toHaveLength(1);
  });

  it('undo right after a change commits it first (the toast "Anulează" path)', () => {
    hall().setLength(30);
    history().undo(); // before the coalescing delay
    expect(hall().length).toBe(12);
    expect(history().canRedo).toBe(true);
  });

  it('caps the history', () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      hall().setLength(13 + (i % 50));
      vi.advanceTimersByTime(HALL_COALESCE_MS);
    }
    expect(history().past.length).toBe(HISTORY_LIMIT);
  });

  it('reset forgets everything', () => {
    dragLength([18]);
    history().reset();
    expect(history().canUndo).toBe(false);
    history().undo();
    expect(hall().length).toBe(18);
  });
});
