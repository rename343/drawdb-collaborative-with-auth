import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import ControlPanel from "./EditorHeader/ControlPanel";
import Canvas from "./EditorCanvas/Canvas";
import CollaborationCursors from "./CollaborationCursors";
import { CanvasContextProvider } from "../context/CanvasContext";
import SidePanel from "./EditorSidePanel/SidePanel";
import { DB, State } from "../data/constants";
import { db } from "../data/db";
import { diagramApi } from "../api/diagrams";
import {
  useLayout,
  useSettings,
  useTransform,
  useDiagram,
  useUndoRedo,
  useAreas,
  useNotes,
  useTypes,
  useSaveState,
  useEnums,
  useNavigateWithParams,
} from "../hooks";
import { useCollabSession, useCollabState } from "../collaboration/react";
import { snapshotsEqual } from "../collaboration/equal";
import { applyDBMLToDocument } from "../utils/importFrom/dbmlApply";
import FloatingControls from "./FloatingControls";
import { Modal, Tag } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { databases } from "../data/databases";
import { isRtl } from "../i18n/languages";
import { useMatch, useParams } from "react-router-dom";

const SIDEPANEL_MIN_WIDTH = 374;

export default function WorkSpace({ forcedDiagramId } = {}) {
  const [title, setTitle] = useState("Untitled Diagram");
  const [resize, setResize] = useState(false);
  const [toolbarContainer, setToolbarContainer] = useState(null);
  const [width, setWidth] = useState(SIDEPANEL_MIN_WIDTH);
  const [lastSaved, setLastSaved] = useState("");
  const [showSelectDbModal, setShowSelectDbModal] = useState(false);
  const [selectedDb, setSelectedDb] = useState("");

  const pendingNewIdRef = useRef(null);
  const loadedIdRef = useRef(null);
  const saveTimerRef = useRef(null);
  const documentPortRef = useRef(null);
  const { layout, setLayout } = useLayout();
  const { settings } = useSettings();
  const { types, setTypes } = useTypes();
  const { areas, setAreas } = useAreas();
  const { notes, setNotes } = useNotes();
  const { saveState, setSaveState } = useSaveState();
  const { transform, setTransform } = useTransform();
  const { enums, setEnums } = useEnums();
  const {
    tables,
    relationships,
    setTables,
    setRelationships,
    database,
    setDatabase,
  } = useDiagram();
  const { undoStack, redoStack, setUndoStack, setRedoStack } = useUndoRedo();
  const session = useCollabSession();
  const collabState = useCollabState();
  const connectionState = collabState.connection;
  const participants = collabState.participants;
  const { t, i18n } = useTranslation();
  const { id: routeDiagramId } = useParams();
  const loadedDiagramId = forcedDiagramId ?? routeDiagramId;
  const editorDiagramMatch = useMatch("/editor/diagrams/:id");
  const directDiagramMatch = useMatch("/diagrams/:id");
  const isDiagram = forcedDiagramId
    ? true
    : Boolean(editorDiagramMatch || directDiagramMatch);
  const isTemplate = useMatch("/editor/templates/:id");
  const isNewDiagram = Boolean(
    isTemplate || !loadedDiagramId || loadedDiagramId === "blank",
  );

  const navigate = useNavigateWithParams();
  const handleResize = (e) => {
    if (!resize) return;
    const w = isRtl(i18n.language) ? window.innerWidth - e.clientX : e.clientX;
    if (w > SIDEPANEL_MIN_WIDTH) setWidth(w);
  };

  const buildDocument = useCallback(
    () => ({
      database,
      tables,
      references: relationships,
      notes,
      areas,
      pan: transform.pan,
      zoom: transform.zoom,
      ...(databases[database].hasEnums && { enums }),
      ...(databases[database].hasTypes && { types }),
    }),
    [database, tables, relationships, notes, areas, transform, enums, types],
  );

  const applyDiagramState = useCallback(
    (serverDiagram, { remote = false, source } = {}) => {
      const isRemote = remote || source === "remote";
      const diagram = serverDiagram.document ?? serverDiagram;
      setDatabase(diagram.database || DB.GENERIC);
      setTitle(serverDiagram.name ?? diagram.name ?? "Untitled diagram");
      setTables(diagram.tables ?? []);
      setRelationships(diagram.references ?? diagram.relationships ?? []);
      setAreas(diagram.areas ?? diagram.subjectAreas ?? []);
      setNotes(diagram.notes ?? []);
      if (!isRemote) {
        setTransform({
          pan: diagram.pan ?? { x: 0, y: 0 },
          zoom: diagram.zoom ?? 1,
        });
      }
      setTypes(diagram.types ?? []);
      setEnums(diagram.enums ?? []);
      if (!isRemote) {
        setUndoStack([]);
        setRedoStack([]);
      }
    },
    [
      setAreas,
      setDatabase,
      setEnums,
      setNotes,
      setRedoStack,
      setRelationships,
      setTables,
      setTransform,
      setTypes,
      setUndoStack,
    ],
  );

  const applyPreview = useCallback(
    (operation) => {
      if (operation?.type !== "table.move") return;
      const { id, x, y } = operation.payload;
      setTables((current) =>
        current.map((table) => (table.id === id ? { ...table, x, y } : table)),
      );
    },
    [setTables],
  );

  documentPortRef.current = {
    read: () => ({ name: title, document: buildDocument() }),
    apply: applyDiagramState,
    applyPreview,
  };

  const documentPort = useMemo(
    () => ({
      read: () => documentPortRef.current.read(),
      apply: (snapshot, options) =>
        documentPortRef.current.apply(snapshot, options),
      applyPreview: (operation) =>
        documentPortRef.current.applyPreview(operation),
      equal: snapshotsEqual,
    }),
    [],
  );

  const writer = useMemo(
    () => ({
      async write({ name, document, baseVersion }) {
        try {
          const updated = await diagramApi.update(loadedDiagramId, {
            name,
            document,
            baseVersion,
          });
          return { version: updated.version };
        } catch (error) {
          if (error.diagram) {
            return {
              conflict: true,
              diagram: error.diagram,
              version: error.diagram.version,
            };
          }
          throw error;
        }
      },
    }),
    [loadedDiagramId],
  );

  const reader = useMemo(
    () => ({
      read: () => diagramApi.get(loadedDiagramId),
    }),
    [loadedDiagramId],
  );

  const applyExternalDiagram = useCallback(
    (diagram, options) => {
      applyDiagramState(diagram, options);
      session.markSnapshotApplied(diagram);
    },
    [applyDiagramState, session],
  );

  const applyDBML = useCallback(
    async (parsed) => {
      const document = applyDBMLToDocument(parsed, buildDocument());
      setSaveState(State.SAVING);
      const result = await session.commitDiagramEdit({
        name: title,
        document,
      });
      if (!result.ok) {
        setSaveState(State.ERROR);
        return result;
      }

      // A newer remote snapshot may have landed while the acknowledgement was
      // in flight. In that case it already contains this Apply.
      if (session.getState().version === result.version) {
        setTables(document.tables);
        setRelationships(document.references);
        setEnums(document.enums);
        setUndoStack([]);
        setRedoStack([]);
      }
      return result;
    },
    [
      buildDocument,
      session,
      setEnums,
      setRedoStack,
      setRelationships,
      setSaveState,
      setTables,
      setUndoStack,
      title,
    ],
  );

  const save = useCallback(async () => {
    if (!isNewDiagram) {
      await session.saveNow();
      return;
    }
    const targetId = (pendingNewIdRef.current ??= uuidv4());
    try {
      await diagramApi.create({
        id: targetId,
        name: title,
        document: buildDocument(),
      });
      pendingNewIdRef.current = null;
      navigate(`/diagrams/${targetId}`, { replace: true });
      setSaveState(State.SAVED);
      setLastSaved(new Date().toLocaleString());
    } catch (error) {
      if (error.diagram) applyDiagramState(error.diagram, { remote: true });
      console.warn("server autosave failed:", error);
      setSaveState(State.ERROR);
    }
  }, [
    buildDocument,
    title,
    setSaveState,
    isNewDiagram,
    navigate,
    applyDiagramState,
    session,
  ]);

  const load = useCallback(async () => {
    const previousLoadedId = loadedIdRef.current;
    loadedIdRef.current = loadedDiagramId ?? null;

    const resetEditorState = () => {
      session.disconnect();
      setTables([]);
      setRelationships([]);
      setAreas([]);
      setNotes([]);
      setTypes([]);
      setEnums([]);
      setUndoStack([]);
      setRedoStack([]);
      setTransform({ zoom: 1, pan: { x: 0, y: 0 } });
      setTitle("Untitled diagram");
      setLayout((prev) => ({ ...prev, localReadOnly: false }));
    };

    const loadDiagram = async (id) => {
      try {
        const diagram = await diagramApi.get(id);
        setLayout((prev) => ({ ...prev, localReadOnly: false }));
        applyDiagramState(diagram);
        session.connect({
          diagramId: id,
          version: diagram.version,
          document: documentPort,
          writer,
          reader,
          initialSnapshot: {
            name: diagram.name,
            document: diagram.document ?? diagram,
          },
        });
      } catch (error) {
        console.warn("diagram load failed:", error);
        setSaveState(State.FAILED_TO_LOAD);
      }
    };

    const loadTemplate = async (id) => {
      const template = await db.templates
        .where("templateId")
        .equals(id)
        .first();
      if (!template) {
        if (previousLoadedId !== loadedIdRef.current) resetEditorState();
        if (selectedDb === "") setShowSelectDbModal(true);
        return;
      }
      session.disconnect();
      setDatabase(template.database || DB.GENERIC);
      setTitle(template.title);
      setTables(template.tables);
      setRelationships(template.relationships);
      setAreas(template.subjectAreas);
      setNotes(template.notes);
      setTransform({ zoom: 1, pan: { x: 0, y: 0 } });
      setUndoStack([]);
      setRedoStack([]);
      setTypes(template.types ?? []);
      setEnums(template.enums ?? []);
    };

    if (!loadedDiagramId) {
      if (previousLoadedId != null) resetEditorState();
      if (selectedDb === "") setShowSelectDbModal(true);
      return;
    }

    if (isDiagram && loadedDiagramId) {
      await loadDiagram(loadedDiagramId);
      return;
    }

    if (isTemplate && loadedDiagramId) {
      await loadTemplate(loadedDiagramId);
      return;
    }
  }, [
    applyDiagramState,
    session,
    documentPort,
    writer,
    reader,
    setTransform,
    setRedoStack,
    setUndoStack,
    setRelationships,
    setTables,
    setAreas,
    setNotes,
    setTypes,
    setDatabase,
    setEnums,
    selectedDb,
    setSaveState,
    setLayout,
    isDiagram,
    isTemplate,
    loadedDiagramId,
  ]);

  useEffect(() => {
    if (
      tables?.length === 0 &&
      areas?.length === 0 &&
      notes?.length === 0 &&
      types?.length === 0
    )
      return;

    if (settings.autosave) {
      setSaveState(State.SAVING);
    }
  }, [
    undoStack,
    redoStack,
    settings.autosave,
    tables?.length,
    areas?.length,
    notes?.length,
    types?.length,
    relationships?.length,
    transform.zoom,
    title,
    setSaveState,
  ]);

  useEffect(() => {
    if (layout.readOnly) return;
    if (saveState !== State.SAVING) return;
    if (isNewDiagram) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(save, 600);
      return () => window.clearTimeout(saveTimerRef.current);
    }
    session.scheduleSave();
  }, [saveState, layout.readOnly, save, isNewDiagram, session]);

  useEffect(() => {
    const next = collabState.save.state;
    if (next === "saving") {
      setSaveState(State.SAVING);
    } else if (next === "saved") {
      setSaveState(State.SAVED);
      setLastSaved(new Date().toLocaleString());
    } else if (["conflict", "error", "offline"].includes(next)) {
      setSaveState(State.ERROR);
    }
  }, [collabState.save.state, setSaveState]);

  useEffect(() => {
    document.title = "Editor | drawDB";

    load();
  }, [load]);

  return (
    <div className="h-full flex flex-col overflow-hidden theme">
      <ControlPanel
        title={title}
        setTitle={setTitle}
        lastSaved={lastSaved}
        toolbarContainer={toolbarContainer}
        applyDiagram={applyExternalDiagram}
      />
      <div
        className="flex h-full overflow-y-auto"
        onPointerUp={(e) => e.isPrimary && setResize(false)}
        onPointerLeave={(e) => e.isPrimary && setResize(false)}
        onPointerMove={(e) => {
          if (!e.isPrimary) return;
          handleResize(e);
        }}
        onPointerDown={(e) => {
          // Required for onPointerLeave to trigger when a touch pointer leaves
          // https://stackoverflow.com/a/70976017/1137077
          e.target.releasePointerCapture(e.pointerId);
        }}
        style={isRtl(i18n.language) ? { direction: "rtl" } : {}}
      >
        {layout.sidebar && (
          <SidePanel
            resize={resize}
            setResize={setResize}
            width={width}
            applyDBML={applyDBML}
          />
        )}
        <div className="relative flex-1 min-w-0 h-full overflow-hidden">
          <CanvasContextProvider className="h-full w-full">
            <Canvas saveState={saveState} setSaveState={setSaveState} />
            <CollaborationCursors />
          </CanvasContextProvider>
          {isDiagram && loadedDiagramId && (
            <div className="pointer-events-none absolute right-3 top-3 z-40 flex items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-3 py-1.5 text-xs text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionState === "connected"
                    ? "bg-emerald-500"
                    : connectionState === "connecting"
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
              />
              <span>
                {t(`collaboration_${connectionState}`, connectionState)}
              </span>
              {participants.length > 0 && (
                <span className="text-zinc-600 dark:text-zinc-300">
                  {t("collaboration_participants", {
                    count: participants.length,
                  })}
                </span>
              )}
            </div>
          )}
          {layout.toolbar && (
            <div
              ref={setToolbarContainer}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
            />
          )}
          {!(layout.sidebar || layout.toolbar || layout.header) && (
            <div className="fixed right-5 bottom-4">
              <FloatingControls />
            </div>
          )}
        </div>
      </div>
      <Modal
        centered
        size="medium"
        closable={false}
        hasCancel={false}
        title={t("pick_db")}
        okText={t("confirm")}
        visible={showSelectDbModal}
        onOk={() => {
          if (selectedDb === "") return;
          setDatabase(selectedDb);
          setShowSelectDbModal(false);
        }}
        okButtonProps={{ disabled: selectedDb === "" }}
      >
        <div className="grid grid-cols-3 gap-4 place-content-center">
          {Object.values(databases).map((x) => (
            <div
              key={x.name}
              onClick={() => setSelectedDb(x.label)}
              className={`space-y-3 p-3 rounded-md border-2 select-none ${
                settings.mode === "dark"
                  ? "bg-zinc-700 hover:bg-zinc-600"
                  : "bg-zinc-100 hover:bg-zinc-200"
              } ${selectedDb === x.label ? "border-zinc-400" : "border-transparent"}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold">{x.name}</div>
                {x.beta && (
                  <Tag size="small" color="light-blue">
                    Beta
                  </Tag>
                )}
              </div>
              {x.image && (
                <img
                  src={x.image}
                  className="h-8"
                  style={{
                    filter:
                      "opacity(0.4) drop-shadow(0 0 0 white) drop-shadow(0 0 0 white)",
                  }}
                />
              )}
              <div className="text-xs">{x.description}</div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
