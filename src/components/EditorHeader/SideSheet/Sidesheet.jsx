import { List, SideSheet as SemiUISideSheet } from "@douyinfe/semi-ui";
import { SIDESHEET } from "../../../data/constants";
import { useUndoRedo } from "../../../hooks";
import { useTranslation } from "react-i18next";

function Timeline() {
  const { undoStack } = useUndoRedo();
  const { t } = useTranslation();

  if (undoStack.length === 0) {
    return <div className="m-5">{t("no_activity")}</div>;
  }

  return (
    <List>
      {[...undoStack].reverse().map((e, i) => (
        <List.Item
          key={i}
          style={{ padding: "4px 18px 4px 18px" }}
          className="hover-1"
        >
          <div className="flex items-center py-1 w-full">
            <i className="block fa-regular fa-circle fa-xs" />
            <div className="ms-2">{e.message}</div>
          </div>
        </List.Item>
      ))}
    </List>
  );
}

export default function Sidesheet({ type, onClose }) {
  const { t } = useTranslation();

  function getTitle(type) {
    switch (type) {
      case SIDESHEET.TIMELINE:
        return t("timeline");
      default:
        break;
    }
  }

  function getContent(type) {
    switch (type) {
      case SIDESHEET.TIMELINE:
        return <Timeline />;
      default:
        break;
    }
  }

  return (
    <SemiUISideSheet
      visible={type !== SIDESHEET.NONE}
      onCancel={onClose}
      width={420}
      title={<div className="text-lg">{getTitle(type)}</div>}
      style={{ paddingBottom: "16px" }}
      bodyStyle={{ padding: "0px" }}
    >
      <div className="sidesheet-theme">{getContent(type)}</div>
    </SemiUISideSheet>
  );
}
