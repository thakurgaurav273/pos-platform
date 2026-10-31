"use client";

import { App, Select } from "antd";
import { Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataTable, type AppTableColumn } from "@/components/DataTable/DataTable";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { useShop } from "@/contexts/ShopContext";
import { apiFetch } from "@/lib/api";
import pageStyles from "./StockTransfersPage.module.css";

type TransferItem = {
  id: string;
  barcode: string;
  productName: string;
  variantName: string;
  quantity: number;
};

type TransferRequest = {
  id: string;
  fromShopCode: string;
  toShopCode: string;
  fromShop: { name: string; shopCode: string };
  toShop: { name: string; shopCode: string };
  status: "PENDING" | "APPROVED" | "REJECTED" | "FULFILLED";
  note: string | null;
  createdById: string | null;
  approvedById: string | null;
  createdAt: string;
  updatedAt: string;
  items: TransferItem[];
};

type TransferTableRow = TransferRequest & {
  fromShopName: string;
  toShopName: string;
  itemsCount: number;
};

type PendingTransferAction = {
  id: string;
  action: "approve" | "reject" | "fulfill";
};

const statusMeta = {
  PENDING: { label: "Pending", pillClass: "st-status-pending" },
  APPROVED: { label: "Approved", pillClass: "st-status-approved" },
  REJECTED: { label: "Rejected", pillClass: "st-status-rejected" },
  FULFILLED: { label: "Fulfilled", pillClass: "st-status-fulfilled" },
} as const;

function buildItemsTitle(items: TransferItem[]): string {
  return items
    .map((i) => `${i.productName} (${i.variantName}) × ${i.quantity}`)
    .join("\n");
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function StockTransfersPage() {
  const { message, modal } = App.useApp();
  const { effectiveShopCode, shops } = useShop();

  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionBusy, setActionBusy] = useState<PendingTransferAction | null>(null);
  const fetchGenRef = useRef(0);
  const actionBusyRef = useRef(actionBusy);
  actionBusyRef.current = actionBusy;

  const currentShop = shops.find((s) => s.shopCode === effectiveShopCode);

  const fetchRequests = useCallback(async () => {
    if (!effectiveShopCode) return;
    const gen = ++fetchGenRef.current;
    setLoading(true);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await apiFetch(`/stock-transfers${qs}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      if (gen !== fetchGenRef.current) return;
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      if (gen !== fetchGenRef.current) return;
      message.error("Failed to load transfer requests");
      setRequests([]);
    } finally {
      if (gen === fetchGenRef.current) {
        setLoading(false);
      }
    }
  }, [effectiveShopCode, statusFilter, message]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleActionRef = useRef<(id: string, action: "approve" | "reject" | "fulfill") => void>(
    () => {}
  );

  const handleAction = useCallback(
    async (id: string, action: "approve" | "reject" | "fulfill") => {
      setActionBusy({ id, action });
      try {
        const res = await apiFetch(`/stock-transfers/${id}/${action}`, {
          method: "PATCH",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body?.message === "string"
              ? body.message
              : `Failed to ${action}`
          );
        }
        message.success(
          action === "approve"
            ? "Request approved!"
            : action === "reject"
              ? "Request rejected."
              : "Transfer fulfilled! Stock has been updated."
        );
        fetchRequests();
      } catch (err: unknown) {
        message.error(
          err instanceof Error ? err.message : `Failed to ${action}`
        );
      } finally {
        setActionBusy(null);
      }
    },
    [fetchRequests, message]
  );

  useEffect(() => {
    handleActionRef.current = handleAction;
  }, [handleAction]);

  const columns: AppTableColumn[] = useMemo(
    () => [
      {
        key: "createdAt",
        label: "Date",
        field: "createdAt",
        minWidth: 112,
        render: (val) => formatDate(String(val ?? "")),
      },
      {
        key: "fromShopName",
        label: "From",
        field: "fromShopName",
        minWidth: 140,
        render: (val) => <span className="st-from-name">{String(val ?? "")}</span>,
      },
      {
        key: "toShopName",
        label: "To",
        field: "toShopName",
        minWidth: 140,
        render: (val) => <span className="st-to-name">{String(val ?? "")}</span>,
      },
      {
        key: "itemsCount",
        label: "Items",
        field: "itemsCount",
        width: 88,
        align: "right",
        render: (val, row) => {
          const r = row as TransferTableRow;
          const n = Number(val) || 0;
          return (
            <span className="st-items-count" title={buildItemsTitle(r.items ?? [])}>
              {n} item{n === 1 ? "" : "s"}
            </span>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        field: "status",
        width: 128,
        align: "center",
        render: (val) => {
          const status = val as TransferRequest["status"];
          const meta = statusMeta[status];
          if (!meta) return <span className="st-status-pill">{String(val)}</span>;
          return (
            <span className={`st-status-pill ${meta.pillClass}`}>
              {meta.label}
            </span>
          );
        },
      },
      {
        key: "note",
        label: "Note",
        field: "note",
        minWidth: 100,
        render: (val) => {
          const t = String(val ?? "").trim();
          if (!t) return <span className="st-note st-note-empty">-</span>;
          return <span className="st-note" title={t}>{t}</span>;
        },
      },
      {
        key: "_actions",
        label: "Actions",
        width: 200,
        render: (_, row) => {
          const r = row as TransferTableRow;
          const busy = actionBusyRef.current;
          const rowPending = busy?.id === r.id;

          if (r.status === "PENDING") {
            return (
              <div className="st-btn-row">
                <button
                  type="button"
                  className="st-btn st-btn-primary"
                  disabled={rowPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleActionRef.current(r.id, "approve");
                  }}
                >
                  {rowPending && busy?.action === "approve" ? "…" : "Approve"}
                </button>
                <button
                  type="button"
                  className="st-btn st-btn-danger"
                  disabled={rowPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleActionRef.current(r.id, "reject");
                  }}
                >
                  {rowPending && busy?.action === "reject" ? "…" : "Reject"}
                </button>
              </div>
            );
          }

          if (r.status === "APPROVED") {
            return (
              <div className="st-btn-row">
                <button
                  type="button"
                  className="st-btn st-btn-primary"
                  disabled={rowPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Fulfilling moves stock between shops at once and has no undo.
                    modal.confirm({
                      title: "Fulfill and ship this transfer?",
                      content: `${r.itemsCount} item${r.itemsCount === 1 ? "" : "s"} will move out of ${r.fromShopName} into ${r.toShopName} now. This cannot be undone.`,
                      okText: "Fulfill & Ship",
                      cancelText: "Not yet",
                      onOk: () => handleActionRef.current(r.id, "fulfill"),
                    });
                  }}
                >
                  <Truck size={14} aria-hidden />
                  <span>{rowPending && busy?.action === "fulfill" ? "…" : "Fulfill & Ship"}</span>
                </button>
              </div>
            );
          }

          return <span className="st-actions-muted">-</span>;
        },
      },
    ],
    [actionBusy, modal],  // re-render columns when actionBusy changes to update button states
  );

  const tableData: TransferTableRow[] = useMemo(
    () =>
      requests.map((r) => ({
        ...r,
        fromShopName: r.fromShop.name,
        toShopName: r.toShop.name,
        itemsCount: r.items.length,
      })),
    [requests]
  );

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.surface}>
        <PageHeader
          className={pageStyles.surfaceHeader}
          title="Stock Transfers"
          description={
            currentShop
              ? `Viewing transfers for ${currentShop.name}.`
              : "Manage stock transfer requests between shops and factory."
          }
          actions={
            <div className={pageStyles.filterGroup}>
              <span className={pageStyles.filterLabel}>Status</span>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                className={pageStyles.statusSelect}
                popupMatchSelectWidth={false}
                options={[
                  { value: "all", label: "All statuses" },
                  ...(
                    Object.keys(statusMeta) as (keyof typeof statusMeta)[]
                  ).map((value) => ({
                    value,
                    label: statusMeta[value].label,
                  })),
                ]}
              />
            </div>
          }
        />

        {requests.length === 0 && !loading ? (
          <EmptyState
            message="No transfer requests found"
            description="Stock transfer requests between shops and factory will appear here once created."
            icon={<Truck size={48} />}
          />
        ) : (
          <div className={pageStyles.tableSlot}>
            <DataTable
              columns={columns}
              data={loading ? [] : tableData}
              loading={loading}
              pageSize={10}
              pageSizeOptions={[10, 15, 25]}
              maxBodyHeight={480}
              emptyTitle="No transfer requests"
              emptyDescription="Try changing the status filter or check back later."
              emptyIcon={<Truck size={28} strokeWidth={1.35} aria-hidden />}
            />
          </div>
        )}
      </div>
    </div>
  );
}
