"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select } from "antd";
import styles from "@/components/Operator/Operator.module.css";
import { DataTable, type AppTableColumn } from "@/components/DataTable/DataTable";
import { StateTag } from "@/components/Operator/OrgActions";
import { useOperatorData } from "@/components/Operator/useOperatorData";
import { fmtDate, fmtMoney, fmtNum, type OrgRow } from "@/components/Operator/types";

export default function BusinessesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<string | undefined>();

  const path = useMemo(() => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set("search", search.trim());
    if (state) qs.set("state", state);
    return `/organizations?${qs.toString()}`;
  }, [search, state]);
  const { data, loading, error } = useOperatorData<OrgRow[]>(path);

  const columns: AppTableColumn[] = [
    {
      key: "name",
      label: "Business",
      minWidth: 200,
      render: (_v, row) => {
        const r = row as OrgRow;
        return (
          <div>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div className={styles.muted}>Joined {fmtDate(r.createdAt)}</div>
          </div>
        );
      },
    },
    {
      key: "owner",
      label: "Owner",
      minWidth: 220,
      render: (_v, row) => {
        const o = (row as OrgRow).owner;
        if (!o) return "—";
        return (
          <div>
            <div>{o.name || o.email}</div>
            {o.name || o.phone ? (
              <div className={styles.muted}>
                {[o.name ? o.email : null, o.phone].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      minWidth: 190,
      render: (_v, row) => {
        const r = row as OrgRow;
        return <StateTag {...r} />;
      },
    },
    {
      key: "size",
      label: "Size",
      minWidth: 140,
      render: (_v, row) => {
        const r = row as OrgRow;
        return (
          <span>
            {r.shopCount} {r.shopCount === 1 ? "shop" : "shops"} · {r.userCount}{" "}
            {r.userCount === 1 ? "user" : "users"}
          </span>
        );
      },
    },
    {
      key: "recent",
      label: "Last 30 days",
      minWidth: 170,
      align: "right",
      render: (_v, row) => {
        const r = row as OrgRow;
        return (
          <div>
            <div style={{ fontWeight: 600 }}>{fmtMoney(r.revenue30d)}</div>
            <div className={styles.muted}>{fmtNum(r.orders30d)} bills</div>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>Businesses</h1>
          <p className={styles.sub}>Open a business to see its shops and people, and to manage its plan.</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Input.Search
          allowClear
          placeholder="Search business name or any user's email"
          style={{ maxWidth: 360 }}
          onSearch={setSearch}
        />
        <Select
          allowClear
          placeholder="All statuses"
          style={{ width: 180 }}
          value={state}
          onChange={setState}
          options={[
            { value: "TRIAL", label: "In trial" },
            { value: "ACTIVE", label: "On a plan" },
            { value: "EXPIRED", label: "Expired" },
          ]}
        />
      </div>

      {error ? <p className={styles.loginError}>{error}</p> : null}
      <DataTable
        columns={columns}
        data={data ?? []}
        loading={loading && !data}
        pageSize={20}
        emptyTitle="No businesses found"
        onRowClick={(row) => router.push(`/operator/businesses/${(row as OrgRow).id}`)}
      />
    </>
  );
}
