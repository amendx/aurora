/**
 * UserSourceResolver — given a PlantaoAPI numeric personId (the id that comes
 * back in coworker/shift listings for "other" users), resolve it to the
 * canonical Firestore user doc that represents that human.
 *
 * Two cases collapse into the same query:
 *   1. The person has an Aurora account → users/{firebaseUid} with source='aurora'
 *      and webClientUserId='<numericId>'.
 *   2. The person is a webClient-only user whose own /auth/login returns a slug id
 *      (e.g. 'OV8BOzQo_JD-'), while their coworker representation uses a numeric
 *      id (e.g. '70917'). The Firestore doc lives at users/{slug} with
 *      source='webClient' and webClientUserId='<numericId>'.
 *
 * The PlantaoAPI uses two different ids for the same person depending on the
 * surface: `apiData.id` on /auth/login (slug for some users, numeric for legacy
 * ones) vs `user.id` on coworker listings (always numeric). The `webClientUserId`
 * field on the user doc bridges that gap. Whoever writes to that doc is
 * responsible for populating it so reverse lookups (numeric → canonical) work.
 *
 * Failure mode: any Firestore error returns { canonicalUserId: null, source: 'webClient' }
 * for the requested ids without throwing. The data model stays consistent;
 * callers can re-resolve later.
 */

import Logger from './Logger';

const _cache = new Map(); // personId → { canonicalUserId, source, auroraUid? }

const _setBatch = (ids, value) => {
  for (const id of ids) _cache.set(String(id), value);
};

/**
 * Resolve a batch of PlantaoAPI numeric personIds → canonical user doc.
 * @param {(string|number)[]} personIds
 * @returns {Promise<Map<string, { canonicalUserId: string|null, source: 'aurora'|'webClient', auroraUid?: string }>>}
 */
const resolveBatch = async (personIds) => {
  const out = new Map();
  if (!Array.isArray(personIds) || personIds.length === 0) return out;

  const dedup = [...new Set(personIds.map(String))];
  const missing = [];
  for (const id of dedup) {
    if (_cache.has(id)) out.set(id, _cache.get(id));
    else missing.push(id);
  }
  if (missing.length === 0) return out;

  try {
    const { db } = await import('../services/firebase/config');
    if (!db) {
      _setBatch(missing, { canonicalUserId: null, source: 'webClient' });
      missing.forEach(id => out.set(id, { canonicalUserId: null, source: 'webClient' }));
      return out;
    }
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    // Firestore `in` clause supports up to 10 values per query.
    for (let i = 0; i < missing.length; i += 10) {
      const chunk = missing.slice(i, i + 10);
      const q = query(
        collection(db, 'users'),
        where('webClientUserId', 'in', chunk),
      );
      const snap = await getDocs(q);
      const found = new Set();
      snap.forEach(d => {
        const data = d.data() || {};
        const pid = String(data.webClientUserId);
        const source = data.source === 'aurora' ? 'aurora' : 'webClient';
        const value = {
          canonicalUserId: d.id,
          source,
          ...(source === 'aurora' ? { auroraUid: d.id } : {}),
        };
        _cache.set(pid, value);
        out.set(pid, value);
        found.add(pid);
      });
      // Cache the misses too — avoids re-querying every call. canonicalUserId
      // stays null so callers can detect "no mapping known" vs "mapped to X".
      for (const id of chunk) {
        if (!found.has(id)) {
          const value = { canonicalUserId: null, source: 'webClient' };
          _cache.set(id, value);
          out.set(id, value);
        }
      }
    }
  } catch (err) {
    Logger.warn(`[UserSourceResolver] resolveBatch failed: ${err?.message}`);
    _setBatch(missing, { canonicalUserId: null, source: 'webClient' });
    missing.forEach(id => out.set(id, { canonicalUserId: null, source: 'webClient' }));
  }

  return out;
};

const get = (personId) => _cache.get(String(personId)) || null;

const clear = () => _cache.clear();

export default { resolveBatch, get, clear };
