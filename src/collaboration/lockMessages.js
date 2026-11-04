export function lockHolderName(holder, fallback) {
  if (typeof holder === "string") return holder || fallback;
  return holder?.displayName ?? holder?.name ?? fallback;
}

export function tableLockDeniedMessage(t, blockedBy) {
  if (!blockedBy) return t("collaboration_table_lock_unavailable");
  return t("collaboration_table_lock_denied", {
    name: lockHolderName(blockedBy, t("collaboration_participant")),
  });
}
