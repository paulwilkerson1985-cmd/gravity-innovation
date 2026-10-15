// Frame-stamped playback marks (e.g. a move's impact and the target's reaction), so tests and
// capture scripts can measure beat timing in frames. A small ring buffer; costs nothing at rest.
import { animClock } from '../render/anim';

export interface Mark { name: string; frame: number; t: number }

const marks: Mark[] = [];

export function mark(name: string) {
  marks.push({ name, frame: animClock.frame, t: animClock.time });
  if (marks.length > 64) marks.shift();
}

export function readMarks(): Mark[] { return marks.slice(); }
