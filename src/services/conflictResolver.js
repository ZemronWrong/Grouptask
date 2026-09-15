/**
 * Conflict resolution: timestamp-based last-write-wins.
 * No CRDT — explicitly out of scope.
 */

/**
 * Given a local document and a remote document, return the winner.
 *
 * @param {object} local  — must have an `updatedAt` (ms epoch)
 * @param {object} remote — must have an `updatedAt` (ms epoch)
 * @returns {{ winner: 'local'|'remote', doc: object }}
 */
export function resolveConflict(local, remote) {
  if (!local && remote)  return { winner: 'remote', doc: remote };
  if (local && !remote)  return { winner: 'local',  doc: local  };
  if (!local && !remote) return { winner: 'local',  doc: null   };

  const lt = local.updatedAt  || 0;
  const rt = remote.updatedAt || 0;

  if (rt >= lt) return { winner: 'remote', doc: remote };
  return { winner: 'local', doc: local };
}

/**
 * Merge a batch of remote documents into a local set, returning
 * which docs need updating locally and which should be pushed upstream.
 *
 * @param {object[]} localDocs  — keyed by `id`
 * @param {object[]} remoteDocs — keyed by `id`
 * @returns {{ toApplyLocally: object[], toPushRemote: object[] }}
 */
export function resolveAll(localDocs, remoteDocs) {
  const localMap  = new Map(localDocs.map((d) => [d.id, d]));
  const remoteMap = new Map(remoteDocs.map((d) => [d.id, d]));

  const toApplyLocally = [];
  const toPushRemote   = [];

  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const id of allIds) {
    const local  = localMap.get(id)  || null;
    const remote = remoteMap.get(id) || null;

    const { winner, doc } = resolveConflict(local, remote);

    if (!doc) continue;

    if (winner === 'remote' && local?.updatedAt !== remote?.updatedAt) {
      toApplyLocally.push(doc);
    } else if (winner === 'local' && (!remote || local?.updatedAt !== remote?.updatedAt)) {
      toPushRemote.push(doc);
    }
  }

  return { toApplyLocally, toPushRemote };
}
