"use client";

import { Alert, App, Button, Modal, Segmented, Upload } from "antd";
import { Download, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable, type AppTableColumn } from "@/components/DataTable/DataTable";
import { LoadingDots } from "@/components/LoadingDots/LoadingDots";
import {
  downloadImportTemplate,
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  parseImportFile,
  runImport,
  type ImportKind,
  type ImportRow,
  type ImportRowResult,
  type ImportRowStatus,
  type ImportSummary,
} from "@/lib/catalogImport";

import styles from "./CatalogImportModal.module.css";

type Props = {
  kind: ImportKind;
  open: boolean;
  onClose: () => void;
  /** Called after an import saved something, so the page can reload its list. */
  onImported: () => void;
};

type Stage = "pick" | "checking" | "preview" | "importing" | "done";
type Filter = "all" | ImportRowStatus;

type PreviewRow = ImportRow & { result?: ImportRowResult };

const NOUN: Record<ImportKind, { one: string; many: string }> = {
  products: { one: "product", many: "products" },
  categories: { one: "category", many: "categories" },
};

const STATUS_LABEL: Record<
  ImportRowStatus,
  { preview: string; done: string; className: string }
> = {
  created: { preview: "New", done: "Created", className: styles.created },
  updated: { preview: "Update", done: "Updated", className: styles.updated },
  skipped: { preview: "Skip", done: "Skipped", className: styles.skipped },
  failed: { preview: "Error", done: "Failed", className: styles.failed },
};

const STATUSES: ImportRowStatus[] = ["created", "updated", "skipped", "failed"];

function plural(n: number, word: { one: string; many: string }) {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? word.one : word.many}`;
}

export function CatalogImportModal({ kind, open, onClose, onImported }: Props) {
  const { message } = App.useApp();
  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const noun = NOUN[kind];
  const done = stage === "done";

  const reset = () => {
    setStage("pick");
    setFileName("");
    setRows([]);
    setSummary(null);
    setError(null);
    setFilter("all");
  };

  const close = () => {
    if (stage === "importing") return;
    reset();
    onClose();
  };

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);
    setStage("checking");
    try {
      const sheet = await parseImportFile(file, kind);
      if (sheet.missingColumns.length) {
        throw new Error(
          `Missing column${sheet.missingColumns.length > 1 ? "s" : ""}: ${sheet.missingColumns.join(", ")}. Start from the template, or rename the header row.`,
        );
      }
      if (!sheet.rows.length) {
        throw new Error("The file has a header row but no data rows.");
      }
      if (sheet.rows.length > IMPORT_MAX_ROWS) {
        throw new Error(
          `The file has ${sheet.rows.length.toLocaleString("en-IN")} rows; import at most ${IMPORT_MAX_ROWS.toLocaleString("en-IN")} at a time.`,
        );
      }
      setRows(sheet.rows);
      setSummary(await runImport(kind, sheet.rows, true));
      setStage("preview");
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Could not read that file. Save it as .xlsx or .csv and try again.",
      );
      setStage("pick");
    }
  };

  const onImport = async () => {
    setStage("importing");
    setError(null);
    try {
      const result = await runImport(kind, rows, false);
      setSummary(result);
      setFilter("all");
      setStage("done");
      if (result.created || result.updated || result.newCategories.length) {
        message.success(
          `Imported ${plural(result.created + result.updated, noun)}`,
        );
        onImported();
      }
    } catch (e) {
      setError(
        `Nothing was saved: ${e instanceof Error ? e.message : "the import failed"}`,
      );
      setStage("preview");
    }
  };

  const previewRows = useMemo<PreviewRow[]>(() => {
    const byRow = new Map(summary?.rows.map((r) => [r.row, r]));
    return rows.map((r) => ({ ...r, result: byRow.get(r.row) }));
  }, [rows, summary]);

  const visibleRows = useMemo(() => {
    const base = done
      ? previewRows.filter((r) => r.result?.status !== "created")
      : previewRows;
    return filter === "all"
      ? base
      : base.filter((r) => r.result?.status === filter);
  }, [previewRows, filter, done]);

  const columns = useMemo<AppTableColumn[]>(() => {
    const cols: AppTableColumn[] = [
      { key: "row", label: "Row", field: "row", width: 56, align: "right" },
    ];
    if (kind === "products") {
      cols.push(
        {
          key: "name",
          label: "Product",
          minWidth: 160,
          render: (_v, row) => {
            const r = row as PreviewRow;
            return (
              <div className={styles.nameCell}>
                <span>{r.name ?? "—"}</span>
                <span className={styles.subtle}>{r.variantName ?? "Regular"}</span>
              </div>
            );
          },
        },
        { key: "category", label: "Category", field: "category", minWidth: 110 },
        { key: "price", label: "Price", field: "price", align: "right", width: 84 },
        { key: "quantity", label: "Stock", field: "quantity", align: "right", width: 72 },
        {
          key: "codes",
          label: "SKU / Barcode",
          minWidth: 120,
          render: (_v, row) => {
            const r = row as PreviewRow;
            return (
              <div className={styles.nameCell}>
                <span>{r.sku ?? "—"}</span>
                {r.barcode ? <span className={styles.subtle}>{r.barcode}</span> : null}
              </div>
            );
          },
        },
      );
    } else {
      cols.push({ key: "name", label: "Category", field: "name", minWidth: 160 });
    }
    cols.push({
      key: "result",
      label: "Result",
      minWidth: 220,
      render: (_v, row) => {
        const result = (row as PreviewRow).result;
        if (!result) return null;
        const label = STATUS_LABEL[result.status];
        return (
          <div className={styles.resultCell}>
            <span className={`${styles.pill} ${label.className}`}>
              {done ? label.done : label.preview}
            </span>
            {result.message ? (
              <span className={styles.resultMessage}>{result.message}</span>
            ) : null}
          </div>
        );
      },
    });
    return cols;
  }, [kind, done]);

  const toWrite = summary ? summary.created + summary.updated : 0;
  const busy = stage === "checking" || stage === "importing";

  const filterOptions = useMemo(() => {
    if (!summary) return [];
    const statuses = done ? STATUSES.filter((s) => s !== "created") : STATUSES;
    const total = statuses.reduce((n, s) => n + summary[s], 0);
    return [
      { label: `All (${total})`, value: "all" as Filter },
      ...statuses
        .filter((s) => summary[s] > 0)
        .map((s) => ({
          label: `${done ? STATUS_LABEL[s].done : STATUS_LABEL[s].preview} (${summary[s]})`,
          value: s as Filter,
        })),
    ];
  }, [summary, done]);

  const footer = (() => {
    if (stage === "preview" || stage === "importing") {
      return (
        <div className={styles.footer}>
          <Button onClick={reset} disabled={busy}>
            Choose another file
          </Button>
          <Button
            type="primary"
            onClick={onImport}
            loading={stage === "importing"}
            disabled={toWrite === 0}
          >
            {toWrite === 0
              ? "Nothing to import"
              : `Import ${plural(toWrite, { one: "row", many: "rows" })}`}
          </Button>
        </div>
      );
    }
    if (done) {
      return (
        <div className={styles.footer}>
          <Button onClick={reset}>Import another file</Button>
          <Button type="primary" onClick={close}>
            Done
          </Button>
        </div>
      );
    }
    return (
      <div className={styles.footer}>
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
      </div>
    );
  })();

  return (
    <Modal
      title={`Import ${noun.many}`}
      open={open}
      onCancel={close}
      footer={footer}
      width={stage === "pick" || stage === "checking" ? 560 : 980}
      maskClosable={!busy}
      closable={!busy}
      destroyOnHidden
    >
      <div className={styles.body}>
        {error ? <Alert type="error" showIcon message={error} /> : null}

        {stage === "pick" || stage === "checking" ? (
          <>
            <p className={styles.intro}>
              Upload an Excel (.xlsx) or CSV file with one{" "}
              {kind === "products" ? "item (product variant)" : "category"} per row. You can
              check every row before anything is saved.
            </p>
            <Upload.Dragger
              accept=".xlsx,.csv"
              multiple={false}
              showUploadList={false}
              disabled={busy}
              beforeUpload={(file) => {
                void onFile(file);
                return Upload.LIST_IGNORE;
              }}
            >
              <div className={styles.drop}>
                {stage === "checking" ? (
                  <>
                    <LoadingDots />
                    <span>Checking {fileName}…</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet size={28} strokeWidth={1.5} aria-hidden />
                    <span className={styles.dropTitle}>Drop a file here, or click to choose</span>
                    <span className={styles.subtle}>
                      .xlsx or .csv · up to {IMPORT_MAX_ROWS.toLocaleString("en-IN")} rows
                    </span>
                  </>
                )}
              </div>
            </Upload.Dragger>
            <div className={styles.templateRow}>
              <div>
                <div className={styles.templateTitle}>Start from the template</div>
                <div className={styles.subtle}>
                  Columns:{" "}
                  {IMPORT_COLUMNS[kind]
                    .map((c) => (c.required ? `${c.header}*` : c.header))
                    .join(", ")}
                  . Notes and matching rules are on its second sheet.
                </div>
              </div>
              <Button
                icon={<Download size={16} aria-hidden />}
                onClick={() =>
                  downloadImportTemplate(kind).catch(() =>
                    message.error("Could not create the template"),
                  )
                }
              >
                Template
              </Button>
            </div>
            {kind === "products" ? (
              <p className={styles.subtle}>
                Existing items are matched by SKU, then barcode, then product name and
                variant, and updated; blank cells keep their current value. Missing
                categories are created.
              </p>
            ) : null}
          </>
        ) : summary ? (
          <>
            <div className={styles.summaryHead}>
              <div className={styles.fileName}>
                <FileSpreadsheet size={16} aria-hidden /> {fileName}
              </div>
              <div className={styles.stats}>
                {STATUSES.map((s) => (
                  <div key={s} className={styles.stat}>
                    <span
                      className={`${styles.statValue} ${summary[s] ? STATUS_LABEL[s].className : ""}`}
                    >
                      {summary[s].toLocaleString("en-IN")}
                    </span>
                    <span className={styles.subtle}>
                      {done ? STATUS_LABEL[s].done : `to ${STATUS_LABEL[s].preview.toLowerCase()}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {summary.newCategories.length ? (
              <p className={styles.subtle}>
                {done ? "Created" : "Will create"}{" "}
                {summary.newCategories.length === 1 ? "category" : "categories"}:{" "}
                {summary.newCategories.join(", ")}
              </p>
            ) : null}
            {!done && summary.failed > 0 ? (
              <Alert
                type="warning"
                showIcon
                message={`${plural(summary.failed, { one: "row has", many: "rows have" })} errors and will be left out. Fix them in the file and import it again, or import the rest now.`}
              />
            ) : null}
            {done && visibleRows.length === 0 && filter === "all" ? (
              <Alert
                type="success"
                showIcon
                message={`All ${plural(summary.created, { one: "row", many: "rows" })} imported.`}
              />
            ) : (
              <>
                <div className={styles.tableBar}>
                  <span className={styles.subtle}>
                    {done ? "Rows not created, with reasons" : "Preview"}
                  </span>
                  {filterOptions.length > 2 ? (
                    <Segmented<Filter>
                      options={filterOptions}
                      value={filter}
                      onChange={setFilter}
                    />
                  ) : null}
                </div>
                <DataTable
                  columns={columns}
                  data={visibleRows}
                  rowKey="row"
                  pageSize={50}
                  filterKey={`${stage}-${filter}`}
                  maxBodyHeight={360}
                  loading={stage === "importing"}
                  emptyTitle="No rows"
                  emptyDescription="No rows match this filter."
                />
              </>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
