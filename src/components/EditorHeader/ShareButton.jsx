import { useMemo, useRef, useState } from "react";
import { Button, Input, Modal, Tooltip, Toast } from "@douyinfe/semi-ui";
import { IconShareStroked } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { buildDiagramShareUrl } from "../../utils/share";

export default function ShareButton({ diagramId, isTemplate }) {
  const { t } = useTranslation();
  const [fallbackUrl, setFallbackUrl] = useState(null);
  const urlInputRef = useRef(null);

  const shareUrl = useMemo(
    () =>
      isTemplate
        ? null
        : buildDiagramShareUrl(window.location.origin, diagramId),
    [diagramId, isTemplate],
  );

  const disabledTooltip = isTemplate
    ? t("share_templates_unavailable")
    : t("share_save_first");

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(shareUrl);
      Toast.success(t("copied_to_clipboard"));
    } catch {
      setFallbackUrl(shareUrl);
    }
  };

  const selectFallbackUrl = () => {
    const input = urlInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  };

  return (
    <>
      <Tooltip
        content={shareUrl ? t("copy_link") : disabledTooltip}
        position="bottom"
      >
        <span className="inline-flex">
          <Button
            type="primary"
            className="!rounded-md"
            icon={<IconShareStroked />}
            disabled={!shareUrl}
            onClick={copyShareUrl}
          >
            {t("share")}
          </Button>
        </span>
      </Tooltip>
      <Modal
        title={t("share")}
        visible={fallbackUrl !== null}
        onCancel={() => setFallbackUrl(null)}
        footer={
          <Button type="primary" theme="solid" onClick={selectFallbackUrl}>
            {t("select_link")}
          </Button>
        }
        width={480}
        centered
      >
        <p
          className="text-sm mb-3"
          style={{ color: "var(--semi-color-text-2)" }}
        >
          {t("copy_link_failed")}
        </p>
        <Input
          ref={urlInputRef}
          value={fallbackUrl ?? ""}
          readonly
          aria-label={t("copy_link")}
        />
      </Modal>
    </>
  );
}
