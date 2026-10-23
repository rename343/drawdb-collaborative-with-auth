import {
  Image,
  Input,
  InputNumber,
  Modal as SemiUIModal,
  Spin,
} from "@douyinfe/semi-ui";
import { saveAs } from "file-saver";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DB, MODAL, STATUS } from "../../../data/constants";
import { databases } from "../../../data/databases";
import {
  useAreas,
  useDiagram,
  useEnums,
  useLayout,
  useNavigateWithParams,
  useNotes,
  useSettings,
  useTransform,
  useTypes,
  useUndoRedo,
} from "../../../hooks";
import { isRtl } from "../../../i18n/languages";
import { languages } from "../../../i18n/i18n";
import { importSQL } from "../../../utils/importSQL";
import { normalizeSQLForParser } from "../../../utils/importSQL/normalize";
import CodeEditor from "../../CodeEditor";
import ImportDiagram from "./ImportDiagram";
import ImportSource from "./ImportSource";
import New from "./New";
import Open from "./Open";
import { mergeCustomTypes } from "../../../utils/customTypes";

const extensionToLanguage = {
  md: "markdown",
  sql: "sql",
  dbml: "dbml",
  json: "json",
};

export default function Modal({
  modal,
  setModal,
  title,
  setTitle,
  exportData,
  setExportData,
  importDb,
  importFrom,
  saveAsCopy,
}) {
  const { t, i18n } = useTranslation();
  const { setTables, setRelationships, database } = useDiagram();
  const { setNotes } = useNotes();
  const { setAreas } = useAreas();
  const { setTypes } = useTypes();
  const { setEnums } = useEnums();
  const { setTransform } = useTransform();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { settings, setSettings } = useSettings();
  const { layout } = useLayout();
  const [uncontrolledTitle, setUncontrolledTitle] = useState(title);
  const [uncontrolledLanguage, setUncontrolledLanguage] = useState(
    i18n.language,
  );
  const [tempTableWidth, setTempTableWidth] = useState(settings.tableWidth);
  const [importSource, setImportSource] = useState({
    src: "",
    overwrite: false,
  });
  const [importData, setImportData] = useState(null);
  const [error, setError] = useState({
    type: STATUS.NONE,
    message: "",
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState(-1);
  const [selectedDiagramId, setSelectedDiagramId] = useState(0);
  const [saveAsTitle, setSaveAsTitle] = useState(title);
  const navigate = useNavigateWithParams();

  useEffect(() => {
    if (modal === MODAL.SAVEAS) setSaveAsTitle(title);
  }, [modal, title]);

  const overwriteDiagram = () => {
    setTables(importData.tables);
    setRelationships(importData.relationships);
    setAreas(importData.subjectAreas ?? []);
    setNotes(importData.notes ?? []);
    if (importData.title) {
      setTitle(importData.title);
    }
    if (databases[database].hasEnums && importData.enums) {
      setEnums(importData.enums);
    }
    if (databases[database].hasTypes && importData.types) {
      setTypes(importData.types);
    }
    if (importData.customTypes) {
      mergeCustomTypes(importData.customTypes);
    }
  };

  // The SQL grammars are large enough to dominate the main bundle, so they are
  // loaded on demand when an import is actually run.
  const parseSQLAndLoadDiagram = async () => {
    const targetDatabase = database === DB.GENERIC ? importDb : database;

    let ast = null;
    try {
      if (targetDatabase === DB.ORACLESQL) {
        const { Parser: OracleParser } = await import("oracle-sql-parser");
        const oracleParser = new OracleParser();

        ast = oracleParser.parse(importSource.src);
      } else {
        const { Parser } = await import("node-sql-parser");
        const parser = new Parser();
        const normalizedSource = normalizeSQLForParser(
          importSource.src,
          targetDatabase,
        );

        ast = parser.astify(normalizedSource, {
          database: targetDatabase,
        });
      }
    } catch (error) {
      const message = error.location
        ? `${error.name} [Ln ${error.location.start.line}, Col ${error.location.start.column}]: ${error.message}`
        : error.message;

      setError({ type: STATUS.ERROR, message });
      return;
    }

    try {
      const diagramData = importSQL(
        ast,
        database === DB.GENERIC ? importDb : database,
        database,
      );

      if (importSource.overwrite) {
        setTables(diagramData.tables);
        setRelationships(diagramData.relationships);
        if (databases[database].hasTypes) setTypes(diagramData.types ?? []);
        if (databases[database].hasEnums) setEnums(diagramData.enums ?? []);
        setTransform((prev) => ({ ...prev, pan: { x: 0, y: 0 } }));
        setNotes([]);
        setAreas([]);
      } else {
        setTables((prev) => [...prev, ...diagramData.tables]);
        setRelationships((prev) =>
          [...prev, ...diagramData.relationships].map((r, i) => ({
            ...r,
            id: i,
          })),
        );
        if (databases[database].hasTypes && diagramData.types.length)
          setTypes((prev) => [...prev, ...diagramData.types]);
        if (databases[database].hasEnums && diagramData.enums.length)
          setEnums((prev) => [...prev, ...diagramData.enums]);
      }

      setUndoStack([]);
      setRedoStack([]);

      setModal(MODAL.NONE);
    } catch (e) {
      setError({
        type: STATUS.ERROR,
        message: `Please check for syntax errors or let us know about the error.`,
      });
    }
  };

  const getModalOnOk = async () => {
    switch (modal) {
      case MODAL.IMG:
        saveAs(
          exportData.data,
          `${exportData.filename}.${exportData.extension}`,
        );
        return;
      case MODAL.CODE: {
        const blob = new Blob([exportData.data], {
          type: "application/json",
        });
        saveAs(blob, `${exportData.filename}.${exportData.extension}`);
        return;
      }
      case MODAL.IMPORT:
        if (error.type !== STATUS.ERROR) {
          setTransform((prev) => ({ ...prev, pan: { x: 0, y: 0 } }));
          overwriteDiagram();
          setImportData(null);
          setModal(MODAL.NONE);
          setUndoStack([]);
          setRedoStack([]);
        }
        return;
      case MODAL.IMPORT_SRC:
        parseSQLAndLoadDiagram();
        return;
      case MODAL.OPEN:
        if (!selectedDiagramId) return;
        navigate(`/editor/diagrams/${selectedDiagramId}`, "_blank");
        setModal(MODAL.NONE);
        return;
      case MODAL.RENAME:
        setTitle(uncontrolledTitle);
        setModal(MODAL.NONE);
        return;
      case MODAL.SAVEAS:
        await saveAsCopy(saveAsTitle);
        setModal(MODAL.NONE);
        return;
      case MODAL.NEW:
        window.open("/editor/templates/" + selectedTemplateId, "_blank");
        setModal(MODAL.NONE);
        return;
      case MODAL.LANGUAGE:
        i18n.changeLanguage(uncontrolledLanguage);
        setModal(MODAL.NONE);
        return;
      case MODAL.TABLE_WIDTH:
        setSettings((prev) => ({ ...prev, tableWidth: tempTableWidth }));
        setModal(MODAL.NONE);
        return;
      default:
        setModal(MODAL.NONE);
        return;
    }
  };

  const getModalBody = () => {
    switch (modal) {
      case MODAL.IMPORT:
        return (
          <ImportDiagram
            setImportData={setImportData}
            error={error}
            setError={setError}
            importFrom={importFrom}
          />
        );
      case MODAL.IMPORT_SRC:
        return (
          <ImportSource
            importData={importSource}
            setImportData={setImportSource}
            error={error}
            setError={setError}
          />
        );
      case MODAL.NEW:
        return (
          <New
            selectedTemplateId={selectedTemplateId}
            setSelectedTemplateId={setSelectedTemplateId}
          />
        );
      case MODAL.RENAME:
        return (
          <Input
            key={title}
            placeholder={t("name")}
            defaultValue={title}
            onChange={(v) => setUncontrolledTitle(v)}
            readonly={layout.readOnly}
          />
        );
      case MODAL.OPEN:
        return (
          <Open
            selectedDiagramId={selectedDiagramId}
            setSelectedDiagramId={setSelectedDiagramId}
          />
        );
      case MODAL.SAVEAS:
        return (
          <Input
            placeholder={t("name")}
            value={saveAsTitle}
            onChange={(v) => setSaveAsTitle(v)}
          />
        );
      case MODAL.CODE:
      case MODAL.IMG:
        if (exportData.data !== "" || exportData.data) {
          return (
            <>
              {modal === MODAL.IMG ? (
                <Image src={exportData.data} alt="Diagram" height={280} />
              ) : (
                <CodeEditor
                  height={360}
                  value={exportData.data}
                  language={extensionToLanguage[exportData.extension]}
                  options={{ readOnly: true }}
                  showCopyButton={true}
                />
              )}
              <div className="text-sm font-semibold mt-2">{t("filename")}:</div>
              <Input
                value={exportData.filename}
                placeholder={t("filename")}
                suffix={<div className="p-2">{`.${exportData.extension}`}</div>}
                onChange={(value) =>
                  setExportData((prev) => ({ ...prev, filename: value }))
                }
                field="filename"
              />
            </>
          );
        } else {
          return (
            <div className="text-center my-3 text-sky-600">
              <Spin tip={t("loading")} size="large" />
            </div>
          );
        }
      case MODAL.TABLE_WIDTH:
        return (
          <InputNumber
            className="w-full"
            value={tempTableWidth}
            readonly={layout.readOnly}
            onChange={(c) => {
              if (c < 180) return;
              setTempTableWidth(c);
            }}
          />
        );
      case MODAL.LANGUAGE:
        return (
          <div className="grid grid-cols-4 md:grid-cols-2 gap-4">
            {languages.map((l) => (
              <button
                key={l.code}
                onClick={() => setUncontrolledLanguage(l.code)}
                className={`space-y-1 py-3 px-4 rounded-md border-2 ${
                  settings.mode === "dark"
                    ? "bg-zinc-700 hover:bg-zinc-600"
                    : "bg-zinc-100 hover:bg-zinc-200"
                } ${
                  uncontrolledLanguage === l.code
                    ? "border-zinc-400"
                    : "border-transparent"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="font-semibold">{l.native_name}</div>
                  <div className="opacity-60">{l.code}</div>
                </div>
                <div className="text-start">{l.name}</div>
              </button>
            ))}
          </div>
        );
      default:
        return <></>;
    }
  };

  const modalTitle = () => {
    switch (modal) {
      case MODAL.IMPORT:
        return t("import_diagram");
      case MODAL.IMPORT_SRC:
        return t("import_from_source");
      case MODAL.CODE:
        return t("export");
      case MODAL.IMG:
        return t("export_image");
      case MODAL.RENAME:
        return t("rename_diagram");
      case MODAL.OPEN:
        return t("open_diagram");
      case MODAL.SAVEAS:
        return t("save_as");
      case MODAL.NEW:
        return t("create_new_diagram");
      case MODAL.TABLE_WIDTH:
        return t("table_width");
      case MODAL.LANGUAGE:
        return t("language");
      default:
        return "";
    }
  };

  const modalWidth = () => {
    switch (modal) {
      case MODAL.LANGUAGE:
      case MODAL.OPEN:
      case MODAL.CODE:
      case MODAL.NEW:
        return 740;
      default:
        return 600;
    }
  };

  const okText = () => {
    switch (modal) {
      case MODAL.IMPORT:
      case MODAL.IMPORT_SRC:
        return t("import");
      case MODAL.CODE:
      case MODAL.IMG:
        return t("export");
      case MODAL.RENAME:
        return t("rename");
      case MODAL.OPEN:
        return t("open");
      case MODAL.SAVEAS:
        return t("save_as");
      case MODAL.NEW:
        return t("create");
      default:
        return t("confirm");
    }
  };

  return (
    <SemiUIModal
      style={isRtl(i18n.language) ? { direction: "rtl" } : {}}
      title={modalTitle()}
      visible={modal !== MODAL.NONE && modal !== MODAL.CONFIG_CUSTOM_TYPES}
      onOk={getModalOnOk}
      afterClose={() => {
        setExportData(() => ({
          data: "",
          extension: "",
          filename: `${title}_${new Date().toISOString()}`,
        }));
        setError({
          type: STATUS.NONE,
          message: "",
        });
        setImportData(null);
        setImportSource({
          src: "",
          overwrite: false,
        });
      }}
      onCancel={() => {
        if (modal === MODAL.RENAME) setUncontrolledTitle(title);
        if (modal === MODAL.LANGUAGE) setUncontrolledLanguage(i18n.language);
        if (modal === MODAL.TABLE_WIDTH) setTempTableWidth(settings.tableWidth);
        setModal(MODAL.NONE);
      }}
      centered
      closeOnEsc={true}
      okText={okText()}
      okButtonProps={{
        disabled:
          (error && error?.type === STATUS.ERROR) ||
          (modal === MODAL.IMPORT &&
            (error.type === STATUS.ERROR || !importData)) ||
          (modal === MODAL.RENAME && title === "") ||
          ((modal === MODAL.IMG || modal === MODAL.CODE) && !exportData.data) ||
          (modal === MODAL.SAVEAS && saveAsTitle === "") ||
          (modal === MODAL.IMPORT_SRC && importSource.src === ""),
      }}
      hasCancel
      cancelText={t("cancel")}
      width={modalWidth()}
      bodyStyle={{
        maxHeight: window.innerHeight - 280,
        overflow:
          modal === MODAL.CODE || modal === MODAL.IMG ? "hidden" : "auto",
        direction: "ltr",
      }}
    >
      {getModalBody()}
    </SemiUIModal>
  );
}
