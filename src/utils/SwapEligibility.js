/**
 * SwapEligibility — pure function.
 *
 * Decides whether a swap of shiftA (initiator's) for shiftB (target's) is allowed.
 *
 * Rule (as defined in roadmap):
 *   Both users must be members of BOTH groups involved (shiftA.group.id and shiftB.group.id).
 *   Neither shift may have already started.
 *
 * The client only knows the initiator's group memberships for sure. The target's memberships
 * may be unknown at proposal-creation time — in that case pass an empty array and rely on
 * the target's accept screen to re-validate (or pass what's cached from a recent roster load).
 */

export function canSwap({ initiatorGroups = [], targetGroups = null, shiftA, shiftB }) {
  if (!shiftA?.group?.id || !shiftB?.group?.id) {
    return { ok: false, reason: 'missing_group' };
  }

  const gA = String(shiftA.group.id);
  const gB = String(shiftB.group.id);

  const initiatorIds = (initiatorGroups || []).map(String);
  const initiatorIn = (g) => initiatorIds.includes(g);
  if (!initiatorIn(gA) || !initiatorIn(gB)) {
    return { ok: false, reason: 'initiator_not_in_both' };
  }

  // Target group membership check — only enforced when the caller actually knows it.
  if (Array.isArray(targetGroups)) {
    const targetIds = targetGroups.map(String);
    const targetIn = (g) => targetIds.includes(g);
    if (!targetIn(gA) || !targetIn(gB)) {
      return { ok: false, reason: 'target_not_in_both' };
    }
  }

  const now = Date.now();
  if (new Date(shiftA.startISO).getTime() <= now) return { ok: false, reason: 'shiftA_already_started' };
  if (new Date(shiftB.startISO).getTime() <= now) return { ok: false, reason: 'shiftB_already_started' };

  const eligibleGroupIds = gA === gB ? [gA] : [gA, gB];
  return { ok: true, eligibleGroupIds };
}

export default canSwap;
