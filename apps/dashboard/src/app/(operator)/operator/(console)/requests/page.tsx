"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { App, Select, Tag } from "antd";
import styles from "@/components/Operator/Operator.module.css";
import { DataTable, type AppTableColumn } from "@/components/DataTable/DataTable";
import { useOperatorData } from "@/components/Operator/useOperatorData";
import { fmtDate, type EnquiryRow, type EnquiryStatus } from "@/components/Operator/types";
import { operatorRequest } from "@/lib/operatorSession";

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "CLOSED", label: "Closed" },
];

export default function RequestsPage() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<EnquiryStatus | undefined>("OPEN");
  const path = useMemo(() => `/enquiries${status ? `?status=${status}` : ""}`, [status]);
  const { data, loading, error, reload } = useOperatorData<EnquiryRow[]>(path);

  const setRowStatus = async (id: string, next: EnquiryStatus) => {
    const r = await operatorRequest(`/enquiries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    if (!r.ok) return message.error(r.message ?? "Could not update.");
    reload();
  };

  const columns: AppTableColumn[] = [
    {
      key: "createdAt",
      label: "Received",
      minWidth: 110,
      render: (_v, row) => fmtDate((row as EnquiryRow).createdAt),
    },
    {
      key: "business",
      label: "Business",
      minWidth: 180,
      render: (_v, row) => {
        const r = row as EnquiryRow;
        return (
          <Link
            href={`/operator/businesses/${r.organization.id}`}
            style={{ fontWeight: 600, color: "#4338ca" }}
          >
            {r.organization.name}
          </Link>
        );
      },
    },
    {
      key: "contact",
      label: "Contact",
      minWidth: 220,
      render: (_v, row) => {
        const r = row as EnquiryRow;
        return (
          <div>
            <div>{r.contactName}</div>
            <div className={styles.muted}>
              <a href={`mailto:${r.email}`}>{r.email}</a>
              {r.phone ? ` · ${r.phone}` : ""}
            </div>
          </div>
        );
      },
    },
    {
      key: "request",
      label: "Request",
      minWidth: 260,
      render: (_v, row) => {
        const r = row as EnquiryRow;
        return (
          <div>
            {r.plan ? <Tag>{r.plan}</Tag> : null}
            {r.message ? (
              <div className={styles.muted} style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                {r.message}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      minWidth: 140,
      render: (_v, row) => {
        const r = row as EnquiryRow;
        return (
          <Select
            size="small"
            value={r.status}
            style={{ width: 120 }}
            options={STATUS_OPTIONS}
            onChange={(v) => void setRowStatus(r.id, v as EnquiryStatus)}
          />
        );
      },
    },
  ];

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>Plan requests</h1>
          <p className={styles.sub}>
            Businesses that asked to move to a paid plan. Contact them, then activate the plan from
            the business page.
          </p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Select
          allowClear
          placeholder="All requests"
          style={{ width: 180 }}
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
        />
      </div>

      {error ? <p className={styles.loginError}>{error}</p> : null}
      <DataTable
        columns={columns}
        data={data ?? []}
        loading={loading && !data}
        pageSize={20}
        emptyTitle="No plan requests"
      />
    </>
  );
}
