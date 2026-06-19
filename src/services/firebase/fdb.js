/**
 * fdb — fachada instrumentada do firebase/firestore.
 *
 * Reexporta a SDK do Firestore, mas conta cada operação de REQUISIÇÃO
 * (leitura, escrita e entrega de listener) no ApiCounter, pra medirmos o
 * volume real de uso e otimizar.
 *
 * Custo do Firestore é por documento: leituras contam por doc retornado,
 * escritas por doc gravado, listeners por doc em cada entrega de snapshot.
 *
 * Use isto no lugar de `firebase/firestore` em TODO caller que faça request.
 * (config.js de init continua importando a SDK direto — init não é request.)
 */

import * as FS from 'firebase/firestore';
import ApiCounter from '../../utils/ApiCounter';

// ── Reads ───────────────────────────────────────────────────────────────────
export const getDocs = async (...args) => {
  const snap = await FS.getDocs(...args);
  ApiCounter.bump('fb:read', Math.max(snap?.size || 0, 1));
  return snap;
};

export const getDoc = async (...args) => {
  const snap = await FS.getDoc(...args);
  ApiCounter.bump('fb:read', 1);
  return snap;
};

// ── Writes ──────────────────────────────────────────────────────────────────
export const setDoc = (...args) => { ApiCounter.bump('fb:write', 1); return FS.setDoc(...args); };
export const deleteDoc = (...args) => { ApiCounter.bump('fb:write', 1); return FS.deleteDoc(...args); };

// Batch — conta no commit pelo nº de ops acumuladas.
export const writeBatch = (db) => {
  const b = FS.writeBatch(db);
  let ops = 0;
  const wrap = (name) => (...a) => { ops += 1; return b[name](...a); };
  return {
    set: wrap('set'),
    update: wrap('update'),
    delete: wrap('delete'),
    commit: () => { ApiCounter.bump('fb:write', ops || 1); return b.commit(); },
  };
};

// ── Listeners ───────────────────────────────────────────────────────────────
export const onSnapshot = (ref, next, error, complete) => {
  if (typeof next === 'function') {
    return FS.onSnapshot(ref, (snap) => {
      ApiCounter.bump('fb:listen', Math.max(snap?.size || 0, 1));
      next(snap);
    }, error, complete);
  }
  return FS.onSnapshot(ref, next, error, complete);
};

// ── Passthrough (não geram custo por si) ────────────────────────────────────
export const collection = FS.collection;
export const doc = FS.doc;
export const query = FS.query;
export const where = FS.where;
export const orderBy = FS.orderBy;
export const limit = FS.limit;
export const arrayUnion = FS.arrayUnion;
export const serverTimestamp = FS.serverTimestamp;
export const getFirestore = FS.getFirestore;
