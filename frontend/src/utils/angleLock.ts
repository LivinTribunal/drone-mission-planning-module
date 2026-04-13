// geometric coupling of hover-point-lock height / distance / gimbal angle:
// angle = atan2(height, distance), where a downward tilt is returned as a
// negative pitch (e.g. -30 means camera points 30° below horizontal).
//
// when the user edits one of the three locked dimensions, the derived third
// is recomputed so the triangle stays consistent.

export type LockedDim = "height" | "distance" | "angle";

export interface LockInputs {
  height: number; // meters above LHA
  distance: number; // meters ground distance from LHA
  angle: number; // gimbal pitch in degrees (negative = down)
}

function deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function rad(d: number): number {
  return (d * Math.PI) / 180;
}

/**
 * recompute the dimension NOT passed in `changed`.
 * returns a full set of {height, distance, angle} — caller decides which to apply.
 *
 * dimension to derive is whichever is NOT `changed` and NOT fixed as needed:
 * convention: user edits one value at a time, the dimension to derive is `lockedOut`.
 */
export function recomputeLockedDimension(args: {
  inputs: LockInputs;
  changed: LockedDim;
  lockedOut: LockedDim;
}): LockInputs {
  const { inputs, changed, lockedOut } = args;
  if (changed === lockedOut) {
    // nothing to do - the edited value is the one that would be recomputed
    return inputs;
  }

  const { height, distance, angle } = inputs;

  // which two are inputs? whichever is not the lockedOut
  if (lockedOut === "angle") {
    // derive angle from height + distance
    if (distance <= 0) return inputs;
    const newAngle = -deg(Math.atan2(height, distance));
    return { height, distance, angle: newAngle };
  }
  if (lockedOut === "height") {
    // derive height from distance + angle (angle negative = looking down)
    const pitch = -rad(angle);
    const newHeight = distance * Math.tan(pitch);
    return { height: newHeight, distance, angle };
  }
  // lockedOut === "distance"
  const pitch = -rad(angle);
  const t = Math.tan(pitch);
  if (Math.abs(t) < 1e-6) return inputs;
  const newDistance = height / t;
  return { height, distance: newDistance, angle };
}

/**
 * simple convenience: given two of the three values, solve for the third.
 */
export function solveTriangle(
  known: Partial<LockInputs>,
): Partial<LockInputs> {
  const { height, distance, angle } = known;
  if (height != null && distance != null && angle == null) {
    if (distance <= 0) return known;
    return { ...known, angle: -deg(Math.atan2(height, distance)) };
  }
  if (distance != null && angle != null && height == null) {
    const pitch = -rad(angle);
    return { ...known, height: distance * Math.tan(pitch) };
  }
  if (height != null && angle != null && distance == null) {
    const pitch = -rad(angle);
    const t = Math.tan(pitch);
    if (Math.abs(t) < 1e-6) return known;
    return { ...known, distance: height / t };
  }
  return known;
}
