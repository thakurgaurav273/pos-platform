"use client";

import { App, Button, Drawer, Form, Input, Tooltip } from "antd";
import { Contact, Pencil, Plus, Receipt, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { paymentLabel } from "@/lib/payments";
import { billRefOf } from "@/lib/printInvoice";
import { DataTable, type AppTableColumn } from "@/components/DataTable/DataTable";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { apiFetch, getApiBaseUrl, getAuthHeaders } from "@/lib/api";
import {
  CUSTOMER_NAME_MAX_LENGTH,
  CUSTOMER_PHONE_EDIT_ROLES,
} from "@/lib/customerFields";
import {
  indianMobileRequiredRules,
  normalizeMobileFormValue,
} from "@/lib/mobileNumber";
import { gstinOptionalRules, normalizeGstinFormValue } from "@/lib/gstin";

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  gstin: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
};

type CustomerFormValues = {
  name: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  notes?: string;
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatDate(iso: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function apiErrorMessage(body: unknown, fallback: string): string {
  const m = (body as { message?: unknown } | null)?.message;
  if (typeof m === "string") return m;
  if (Array.isArray(m)) return m.join(", ");
  return fallback;
}

type RecentBill = {
  id: string;
  billNo?: string | null;
  legacyBillRef?: string | null;
  createdAt: string;
  totalAmount: number;
  paymentMethod: string;
  status: string;
};

/** Latest bills for a customer (orders are matched by phone), shown in the drawer. */
function RecentBills({
  phone,
  onOpen,
  onViewAll,
}: {
  phone: string;
  onOpen: (orderId: string) => void;
  onViewAll: () => void;
}) {
  const [bills, setBills] = useState<RecentBill[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/orders?q=${encodeURIComponent(phone)}&page=1&size=5`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.statusText);
        const json = (await res.json()) as { data?: RecentBill[] };
        if (!cancelled) setBills(Array.isArray(json.data) ? json.data : []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Recent bills</span>
        <Button type="link" size="small" className="!px-0" icon={<Receipt size={14} />} onClick={onViewAll}>
          View all
        </Button>
      </div>
      {failed ? (
        <p className="text-sm text-[var(--text-muted)]">Could not load bills.</p>
      ) : bills === null ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : bills.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No bills yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {bills.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onOpen(b.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--ochre-10)]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    #{billRefOf(b)}
                    {b.status === "CANCELLED" ? (
                      <span className="ml-2 text-xs font-normal text-[var(--danger)]">Cancelled</span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {formatDate(b.createdAt)} · {paymentLabel(b.paymentMethod)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {inr.format(Number(b.totalAmount) || 0)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Saved customers of the active shop: search, add, edit, and jump to their bills. */
export default function CustomersManager() {
  const router = useRouter();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { effectiveShopCode } = useShop();
  const shopKey = effectiveShopCode || process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE || "";
  const canEditPhone = CUSTOMER_PHONE_EDIT_ROLES.includes(user?.role ?? "");

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const searchRef = useRef(debouncedSearch);
  searchRef.current = debouncedSearch;
  const [refreshNonce, setRefreshNonce] = useState(0);
  const filterKey = `${shopKey}|${debouncedSearch}|${refreshNonce}`;

  /** null = closed; "new" = add; a row = edit. */
  const [editing, setEditing] = useState<CustomerRow | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<CustomerFormValues>();

  const openEditor = useCallback((row: CustomerRow | "new") => setEditing(row), []);

  /** Form starts from the row being edited; the Form is keyed per row so it remounts. */
  const initialValues: CustomerFormValues | undefined =
    editing === null
      ? undefined
      : editing === "new"
        ? { name: "", phone: "" }
        : {
            name: editing.name,
            phone: editing.phone,
            email: editing.email ?? "",
            gstin: editing.gstin ?? "",
            address: editing.address ?? "",
            notes: editing.notes ?? "",
          };

  const viewOrders = useCallback(
    (row: CustomerRow) => router.push(`/orders?q=${encodeURIComponent(row.phone)}`),
    [router],
  );

  const columns: AppTableColumn[] = useMemo(
    () => [
      {
        key: "name",
        label: "Customer",
        field: "name",
        minWidth: 200,
        render: (_, row) => {
          const r = row as CustomerRow;
          return (
            <div className="min-w-0">
              <div className="max-w-[22rem] truncate font-medium text-[var(--text-primary)]" title={r.name}>
                {r.name}
              </div>
              {r.gstin ? (
                <div className="font-mono text-xs text-[var(--text-muted)]">GSTIN {r.gstin}</div>
              ) : null}
            </div>
          );
        },
      },
      { key: "phone", label: "Phone", field: "phone", width: 130 },
      {
        key: "email",
        label: "Email",
        field: "email",
        minWidth: 160,
        render: (v) => (
          <span className="truncate text-[var(--text-secondary)]">{(v as string) || "-"}</span>
        ),
      },
      { key: "orderCount", label: "Bills", field: "orderCount", width: 80, align: "right" },
      {
        key: "totalSpent",
        label: "Total spent",
        field: "totalSpent",
        width: 130,
        align: "right",
        render: (v) => <span className="tabular-nums">{inr.format(Number(v) || 0)}</span>,
      },
      {
        key: "lastOrderAt",
        label: "Last visit",
        field: "lastOrderAt",
        width: 130,
        render: (v) => formatDate(v as string | null),
      },
      {
        key: "_actions",
        label: "",
        width: 96,
        align: "right",
        render: (_, row) => {
          const r = row as CustomerRow;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Tooltip title="View bills">
                <Button
                  type="text"
                  size="small"
                  aria-label={`View bills for ${r.name}`}
                  icon={<Receipt size={16} />}
                  onClick={() => viewOrders(r)}
                />
              </Tooltip>
              <Tooltip title="Edit">
                <Button
                  type="text"
                  size="small"
                  aria-label={`Edit ${r.name}`}
                  icon={<Pencil size={16} />}
                  onClick={() => openEditor(r)}
                />
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [openEditor, viewOrders],
  );

  const fetchFn = useMemo(() => {
    const baseUrl = getApiBaseUrl();
    return ({ page, pageSize }: { page: number; pageSize: number }) => {
      const u = new URL(
        `${baseUrl}/customers/list`,
        typeof window !== "undefined" ? window.location.origin : "http://localhost",
      );
      u.searchParams.set("page", String(page));
      u.searchParams.set("size", String(pageSize));
      const q = searchRef.current.trim();
      if (q) u.searchParams.set("q", q);
      return fetch(u.toString(), {
        headers: { ...getAuthHeaders(), Accept: "application/json" },
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(await r.text().catch(() => r.statusText));
          return r.json();
        })
        .then((json) => ({
          data: Array.isArray(json.data) ? json.data : [],
          lastPage: Number(json.last_page ?? 1),
        }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopKey]);

  const onSave = async (values: CustomerFormValues) => {
    if (!editing) return;
    setSaving(true);
    const isNew = editing === "new";
    const body: Record<string, string> = {
      name: values.name.trim(),
      email: values.email?.trim() ?? "",
      gstin: values.gstin?.trim() ?? "",
      address: values.address?.trim() ?? "",
      notes: values.notes?.trim() ?? "",
    };
    // Phone is the customer's identity in the shop; only send it when allowed to set it.
    if (isNew || canEditPhone) body.phone = normalizeMobileFormValue(values.phone);
    try {
      const res = await apiFetch(isNew ? "/customers" : `/customers/${editing.id}`, {
        method: isNew ? "POST" : "PATCH",
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        message.error(apiErrorMessage(payload, "Could not save customer."));
        return;
      }
      message.success(isNew ? "Customer added" : "Customer updated");
      setEditing(null);
      setRefreshNonce((n) => n + 1);
    } catch {
      message.error("Network error while saving the customer.");
    } finally {
      setSaving(false);
    }
  };

  if (!shopKey) return null;

  const isNew = editing === "new";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        title="Customers"
        description={
          <>
            Saved customers of this shop. Customers are also saved automatically when a
            bill is generated with a phone number.
          </>
        }
        actions={
        <div className="flex w-full max-w-full items-center gap-2 sm:w-[30rem]">
          <Input
            allowClear
            className="min-w-0 flex-1"
            placeholder="Search name or phone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            prefix={<Search size={16} className="text-[var(--text-muted)]" aria-hidden />}
            aria-label="Search customers"
          />
          <Button
            type="primary"
            className="shrink-0"
            icon={<Plus size={16} />}
            onClick={() => openEditor("new")}
          >
            Add customer
          </Button>
        </div>
        }
      />

      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          fetchFn={fetchFn}
          filterKey={filterKey}
          pageSize={20}
          pageSizeOptions={[10, 20, 50]}
          onRowClick={(row) => openEditor(row as CustomerRow)}
          emptyTitle={debouncedSearch ? "No customers match" : "No customers yet"}
          emptyDescription={
            debouncedSearch
              ? "Try another name or phone number."
              : "Add a customer, or generate a bill with a customer phone number."
          }
          emptyIcon={<Contact size={28} strokeWidth={1.35} aria-hidden />}
        />
      </div>

      <Drawer
        title={isNew ? "Add customer" : editing?.name}
        placement="right"
        size={480}
        open={editing !== null}
        onClose={() => setEditing(null)}
        destroyOnHidden
        extra={
          <div className="flex gap-2">
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>
              {isNew ? "Add" : "Save"}
            </Button>
          </div>
        }
      >
        {!isNew && editing ? (
          <div className="mb-6 flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Bills", value: String(editing.orderCount) },
                { label: "Total spent", value: inr.format(Number(editing.totalSpent) || 0) },
                { label: "Last visit", value: formatDate(editing.lastOrderAt) },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                >
                  <div className="text-xs text-[var(--text-muted)]">{s.label}</div>
                  <div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
            <RecentBills
              phone={editing.phone}
              onOpen={(id) => router.push(`/orders/${id}`)}
              onViewAll={() => viewOrders(editing)}
            />
          </div>
        ) : null}
        <Form
          key={editing === "new" ? "new" : editing?.id}
          form={form}
          layout="vertical"
          onFinish={onSave}
          initialValues={initialValues}
          preserve={false}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, whitespace: true, message: "Enter the customer's name" }]}
          >
            <Input maxLength={CUSTOMER_NAME_MAX_LENGTH} showCount />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Mobile"
            rules={isNew || canEditPhone ? indianMobileRequiredRules : []}
            normalize={normalizeMobileFormValue}
            extra={
              !isNew && !canEditPhone
                ? "Only a manager or admin can change a customer's phone number."
                : undefined
            }
          >
            <Input inputMode="numeric" maxLength={10} disabled={!isNew && !canEditPhone} />
          </Form.Item>
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Enter a valid email" }]}>
              <Input maxLength={254} />
            </Form.Item>
            <Form.Item name="gstin" label="GSTIN" normalize={normalizeGstinFormValue} rules={gstinOptionalRules}>
              <Input maxLength={15} className="font-mono" placeholder="Optional" />
            </Form.Item>
          </div>
          <Form.Item name="address" label="Address">
            <Input.TextArea maxLength={500} autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea maxLength={1000} autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
