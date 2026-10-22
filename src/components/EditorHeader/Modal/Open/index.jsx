import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Input, Spin } from "@douyinfe/semi-ui";
import { IconSearch } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { diagramApi } from "../../../../api/diagrams";

const DEFAULT_SORT = { key: "lastModified", dir: "desc" };

function toEntry(raw) {
  return {
    diagramId: raw.id,
    name: raw.name ?? "",
    lastModified: raw.updated_at ? new Date(raw.updated_at) : null,
  };
}

function filterDiagrams(entries, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) => entry.name.toLowerCase().includes(needle));
}

function timeOf(entry) {
  return entry.lastModified ? entry.lastModified.getTime() : 0;
}

const comparators = {
  name: (a, b) => a.name.localeCompare(b.name),
  lastModified: (a, b) => timeOf(a) - timeOf(b),
};

export function sortDiagrams(entries, { key, dir }) {
  const compare = comparators[key] ?? comparators.lastModified;
  const factor = dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => factor * compare(a, b));
}

function nextSort(current, key) {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: key === "name" ? "asc" : "desc" };
}

function formatTimestamp(date) {
  return date
    ? `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
    : "";
}

function InfoBanner({ type, children }) {
  return (
    <Banner
      fullMode={false}
      type={type}
      bordered
      icon={null}
      closeIcon={null}
      description={<div>{children}</div>}
    />
  );
}

function SortableHeader({ label, sortKey, sort, onSort, className }) {
  const active = sort.key === sortKey;
  const icon =
    active && sort.dir === "asc" ? "bi-caret-up-fill" : "bi-caret-down-fill";

  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 cursor-pointer select-none bg-transparent border-0 p-0 hover:opacity-80"
      >
        {label}
        <i className={`bi text-[12px] ${icon} ${active ? "" : "opacity-30"}`} />
      </button>
    </th>
  );
}

function DiagramTable({ entries, sort, onSort, selectedDiagramId, onSelect }) {
  const { t } = useTranslation();
  const columns = [
    { key: "name", label: t("name") },
    { key: "lastModified", label: t("last_modified") },
  ];

  return (
    <table className="w-full text-left border-separate border-spacing-x-0">
      <thead>
        <tr>
          {columns.map((column) => (
            <SortableHeader
              key={column.key}
              label={column.label}
              sortKey={column.key}
              sort={sort}
              onSort={onSort}
              className="sticky top-0 z-10 py-2 px-3 border-b border-zinc-100 dark:border-zinc-700 sidesheet-theme"
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const selected = selectedDiagramId === entry.diagramId;
          return (
            <tr
              key={entry.diagramId}
              className={`cursor-pointer ${selected ? "bg-blue-300/30" : "hover-1"}`}
              onClick={() => onSelect(entry.diagramId)}
            >
              <td className="py-2 px-3">{entry.name}</td>
              <td className="py-2 px-3">
                {formatTimestamp(entry.lastModified)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function useDiagramList() {
  const { t } = useTranslation();
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    diagramApi
      .list()
      .then((items) => {
        if (!cancelled) {
          setState({ loading: false, error: null, items: items.map(toEntry) });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: error?.message || t("failed_to_load_diagrams"),
            items: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return state;
}

export default function Open({ selectedDiagramId, setSelectedDiagramId }) {
  const { t } = useTranslation();
  const { loading, error, items } = useDiagramList();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);

  const visible = useMemo(
    () => sortDiagrams(filterDiagrams(items, query), sort),
    [items, query, sort],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spin />
      </div>
    );
  }

  if (error) return <InfoBanner type="danger">{error}</InfoBanner>;

  if (items.length === 0) {
    return <InfoBanner type="info">{t("no_saved_diagrams")}</InfoBanner>;
  }

  return (
    <div className="flex flex-col">
      <div className="flex gap-2 flex-wrap mb-3">
        <Input
          prefix={<IconSearch />}
          placeholder={t("search")}
          value={query}
          onChange={setQuery}
          showClear
          className="flex-1"
        />
        {query.trim() !== "" && (
          <Button theme="borderless" onClick={() => setQuery("")}>
            {t("clear")}
          </Button>
        )}
      </div>
      <div className="max-h-[360px] overflow-auto">
        {visible.length > 0 ? (
          <DiagramTable
            entries={visible}
            sort={sort}
            onSort={(key) => setSort((current) => nextSort(current, key))}
            selectedDiagramId={selectedDiagramId}
            onSelect={setSelectedDiagramId}
          />
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400 px-1 py-6 text-center">
            {t("no_diagrams_match")}
          </div>
        )}
      </div>
    </div>
  );
}
