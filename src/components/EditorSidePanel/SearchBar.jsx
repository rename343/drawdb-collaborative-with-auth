import { useMemo, useState } from "react";
import { AutoComplete, TreeSelect } from "@douyinfe/semi-ui";
import { IconSearch } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { useSelect } from "../../hooks";
import { ObjectType } from "../../data/constants";

/**
 * AutoComplete over a named collection. Filtering is derived from the current
 * items, so a list that grows or shrinks while the panel is open stays correct.
 */
export function SearchBar({ items, labelKey = "name", scrollId, onSelect }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  const results = useMemo(() => {
    const labels = items.map((item) => item[labelKey]);
    if (!value) return labels;
    return labels.filter((label) => label.includes(value));
  }, [items, labelKey, value]);

  return (
    <AutoComplete
      data={results}
      value={value}
      showClear
      prefix={<IconSearch />}
      placeholder={t("search")}
      emptyContent={<div className="p-3 popover-theme">{t("not_found")}</div>}
      onSearch={setValue}
      onChange={setValue}
      onSelect={(label) => {
        const item = items.find((candidate) => candidate[labelKey] === label);
        if (!item) return;
        if (scrollId) {
          document
            .getElementById(scrollId(item))
            ?.scrollIntoView({ behavior: "smooth" });
        }
        onSelect?.(item);
      }}
      className="w-full"
    />
  );
}

/** Table + field tree, with the canvas row as the scroll target. */
export function TableSearchBar({ tables }) {
  const { setSelectedElement } = useSelect();
  const { t } = useTranslation();

  const treeData = useMemo(
    () =>
      tables.map(({ id, name: parentName, fields }, i) => ({
        tableId: id,
        id: `${i}`,
        label: parentName,
        value: parentName,
        key: `${i}`,
        children: fields?.map(({ name }, j) => ({
          tableId: id,
          id: `${j}`,
          label: name,
          value: name,
          key: `${i}-${j}`,
        })),
      })),
    [tables],
  );

  return (
    <TreeSelect
      searchPosition="dropdown"
      dropdownStyle={{ maxHeight: 400, overflow: "auto" }}
      treeData={treeData}
      prefix={<IconSearch />}
      emptyContent={<div className="p-3 popover-theme">{t("not_found")}</div>}
      filterTreeNode
      placeholder={t("search")}
      onChange={(node) => {
        const { tableId, id, children } = node;

        setSelectedElement((prev) => ({
          ...prev,
          id: tableId,
          open: true,
          element: ObjectType.TABLE,
        }));
        document
          .getElementById(`scroll_table_${tableId}`)
          ?.scrollIntoView({ behavior: "smooth" });

        if (!children) {
          document
            .getElementById(`scroll_table_${tableId}_input_${id}`)
            ?.focus();
        }
      }}
      onChangeWithObject
      className="w-full"
    />
  );
}
