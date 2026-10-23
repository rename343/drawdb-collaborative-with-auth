import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import {
  useDiagram,
  useEnums,
  useLayout,
  useSaveState,
} from "../../hooks";
import { useCollabStatus, useDiagramEdit } from "../../collaboration/react";
import { toDBML } from "../../utils/exportAs/dbml";
import { State } from "../../data/constants";
import CodeEditor from "../CodeEditor";

function errorMessage(error, fallback) {
  const diagnostic = error?.diags?.[0];
  if (diagnostic) {
    const { line, column } = diagnostic.location?.start ?? {};
    return `${diagnostic.name} [Ln ${line}, Col ${column}]: ${diagnostic.message}`;
  }
  return error?.message || fallback;
}

export default function DBMLEditor({ applyDBML }) {
  const { database, tables, relationships } = useDiagram();
  const { enums } = useEnums();
  const { layout } = useLayout();
  const { saveState } = useSaveState();
  const { connectionState } = useCollabStatus();
  const { phase, isMine, holder, begin, cancel } = useDiagramEdit();
  const { t } = useTranslation();

  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [applying, setApplying] = useState(false);

  const editing = isMine && draft !== null;
  const isMineRef = useRef(isMine);
  const wasMineRef = useRef(false);
  isMineRef.current = isMine;

  const preview = useMemo(
    () => toDBML({ database, tables, relationships, enums }),
    [database, tables, relationships, enums],
  );

  useEffect(() => {
    return () => {
      if (isMineRef.current) cancel();
    };
  }, [cancel]);

  useEffect(() => {
    if (isMine) {
      wasMineRef.current = true;
      return;
    }
    if (!wasMineRef.current) return;
    wasMineRef.current = false;
    setDraft(null);
    if (phase === "lost") {
      setError(t("collaboration_dbml_lock_lost"));
    }
  }, [isMine, phase, t]);

  const holderName =
    holder?.displayName ??
    holder?.name ??
    t("collaboration_participant");

  const beginMessage = (result) => {
    switch (result.reason) {
      case "offline":
        return t("collaboration_dbml_offline");
      case "save-failed":
        return t("collaboration_dbml_save_failed");
      case "held":
      case "table-locked": {
        const blockedBy = result.blockedBy;
        const name =
          blockedBy?.displayName ??
          blockedBy?.name ??
          t("collaboration_participant");
        return t("collaboration_dbml_lock_denied", { name });
      }
      case "requesting":
        return t("collaboration_dbml_requesting");
      case "timeout":
        return t("collaboration_dbml_timeout");
      case "stale":
        return t("collaboration_dbml_stale");
      case "refresh-failed":
        return errorMessage(result, t("collaboration_dbml_lock_unavailable"));
      default:
        return t("collaboration_dbml_lock_unavailable");
    }
  };

  const commitMessage = (result) => {
    if (result.reason === "conflict") {
      return t("collaboration_dbml_conflict");
    }
    if (result.reason === "not-editing") {
      return t("collaboration_dbml_lock_lost");
    }
    return errorMessage(result, t("collaboration_dbml_apply_failed"));
  };

  const startEditing = async () => {
    if (starting || applying) return;
    setError("");
    setStarting(true);
    try {
      const result = await begin();
      if (!result.ok) {
        setError(beginMessage(result));
        return;
      }
      const freshDocument = result.snapshot?.document;
      const source = freshDocument
        ? {
            ...freshDocument,
            relationships:
              freshDocument.references ?? freshDocument.relationships ?? [],
            enums: freshDocument.enums ?? enums,
          }
        : { database, tables, relationships, enums };
      setDraft(toDBML(source));
    } catch (beginError) {
      setError(errorMessage(beginError, t("collaboration_dbml_lock_unavailable")));
    } finally {
      setStarting(false);
    }
  };

  const applyDraft = async () => {
    if (!editing || applying || !applyDBML) return;
    setError("");
    setApplying(true);
    try {
      const { fromDBML } = await import("../../utils/importFrom/dbml");
      const parsed = fromDBML(draft);
      const result = await applyDBML(parsed);
      if (!result.ok) {
        setError(commitMessage(result));
        return;
      }
      setDraft(null);
      Toast.success(t("collaboration_dbml_applied"));
    } catch (applyError) {
      setError(errorMessage(applyError, t("collaboration_dbml_parse_error")));
    } finally {
      setApplying(false);
    }
  };

  const cancelEditing = () => {
    setError("");
    setDraft(null);
    cancel();
  };

  let banner = null;
  if (error) {
    banner = { type: "danger", message: error };
  } else if (layout.localReadOnly) {
    banner = { type: "info", message: t("collaboration_dbml_read_only") };
  } else if (editing) {
    banner = { type: "info", message: t("collaboration_dbml_owner") };
  } else if (holder) {
    banner = {
      type: "warning",
      message: t("collaboration_dbml_locked_by", { name: holderName }),
    };
  } else if (phase === "requesting") {
    banner = { type: "info", message: t("collaboration_dbml_requesting") };
  }

  const canStart =
    !layout.localReadOnly &&
    connectionState === "connected" &&
    saveState !== State.SAVING &&
    !starting &&
    !applying;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-color px-3 py-1.5">
        <span className="text-xs text-color opacity-70">
          {editing
            ? t("collaboration_dbml_editing")
            : t("collaboration_dbml_preview")}
        </span>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="small" onClick={cancelEditing} disabled={applying}>
                {t("collaboration_dbml_cancel")}
              </Button>
              <Button
                size="small"
                theme="solid"
                loading={applying}
                disabled={applying}
                onClick={applyDraft}
              >
                {t("collaboration_dbml_apply")}
              </Button>
            </>
          ) : (
            <Button
              size="small"
              theme="solid"
              loading={starting}
              disabled={!canStart}
              onClick={startEditing}
              title={
                connectionState === "connected"
                  ? undefined
                  : t("collaboration_dbml_offline")
              }
            >
              {t("collaboration_dbml_edit")}
            </Button>
          )}
        </div>
      </div>
      {banner && (
        <Banner
          type={banner.type}
          fullMode={false}
          closeIcon={null}
          className="m-2"
          description={<div>{banner.message}</div>}
        />
      )}
      <div className="min-h-0 flex-1">
        <CodeEditor
          showCopyButton
          value={editing ? draft : preview}
          language="dbml"
          onChange={(value) => {
            if (editing) setDraft(value);
          }}
          height="100%"
          options={{
            readOnly: !editing || layout.localReadOnly,
            minimap: { enabled: false },
          }}
        />
      </div>
    </div>
  );
}
