import {
  CLIENT_ID_PATTERN,
  isValidEntityId,
  isPlainObject,
} from "./validation.js";

export function isValidParticipant(participant) {
  return (
    isPlainObject(participant) &&
    CLIENT_ID_PATTERN.test(participant.clientId || "") &&
    typeof participant.displayName === "string" &&
    participant.displayName.length > 0 &&
    participant.displayName.length <= 64 &&
    typeof participant.color === "string" &&
    participant.color.length <= 32
  );
}

export function isValidOperationPreview(operation) {
  if (!isPlainObject(operation) || operation.type !== "table.move")
    return false;
  const { payload } = operation;
  return (
    isPlainObject(payload) &&
    isValidEntityId(payload.id) &&
    Number.isFinite(payload.x) &&
    Number.isFinite(payload.y)
  );
}
