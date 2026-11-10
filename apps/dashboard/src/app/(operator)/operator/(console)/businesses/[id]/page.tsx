"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { App, Button, Popconfirm, Tag } from "antd";
import styles from "@/components/Operator/Operator.module.css";
import { DataTable, type AppTableColumn } from "@/components/DataTable/DataTable";
import { ActionModal, StateTag, type OrgActionKind } from "@/components/Operator/OrgActions";
import { useOperatorData } from "@/components/Operator/useOperatorData";
import {
  fmtDate,
  fmtMoney,
  fmtNum,
  type OrgDetail,
  type ShopDetail,
  type UserDetail,
} from "@/components/Operator/types";
import { operatorRequest } from "@/lib/operatorSession";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {note ? <div className={styles.statNote}>{note}</div> : null}
    </div>
  );
}

export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { message } = App.useApp();
  const { data: org, loading, error, reload } = useOperatorData<OrgDetail>(
    `/organizations/${id}`,
  );
  const [action, setAction] = useState<OrgActionKind | null>(null);

  if (error && !org) {
    return (
      <>
        <Link href="/operator/businesses" className={styles.back}>
          ← Businesses
        </Link>
        <p className={styles.loginError}>{error}</p>
      </>
    );
  }
  if (loading && !org) return <p className={styles.muted}>Loading…</p>;
  if (!org) return null;

  const sub = org.subscription;
  const grandfathered = sub.state === "ACTIVE" && !sub.paidUntil;

  const revoke = async () => {
    const r = await operatorRequest(`/organizations/${org.id}/revoke`, { method: "POST" });
    if (!r.ok) return message.error(r.message ?? "Could not revoke.");
    message.success(`${org.name} is now read-only.`);
    reload();
  };

  const sendReset = async (u: UserDetail) => {
    const r = await operatorRequest(`/users/${u.id}/password-reset`, { method: "POST" });
    if (!r.ok) return message.error(r.message ?? "Could not send the reset email.");
    message.success(`Reset code sent to ${u.email}.`);
  };

  const shopColumns: AppTableColumn[] = [
    {
      key: "name",
      label: "Shop",
      minWidth: 200,
      render: (_v, row) => {
        const s = row as ShopDetail;
        return (
          <div>
            <div style={{ fontWeight: 600 }}>
              {s.name} {s.isFactory ? <Tag color="purple">Factory</Tag> : null}
            </div>
            <div className={styles.muted}>
              {s.shopCode}
              {s.city ? ` · ${s.city}` : ""}
            </div>
          </div>
        );
      },
    },
    {
      key: "people",
      label: "Users · Products · Customers",
      minWidth: 200,
      render: (_v, row) => {
        const s = row as ShopDetail;
        return `${fmtNum(s.users)} · ${fmtNum(s.products)} · ${fmtNum(s.customers)}`;
      },
    },
    {
      key: "sales",
      label: "All-time sales",
      minWidth: 150,
      align: "right",
      render: (_v, row) => {
        const s = row as ShopDetail;
        return (
          <div>
            <div style={{ fontWeight: 600 }}>{fmtMoney(s.revenue)}</div>
            <div className={styles.muted}>{fmtNum(s.orders)} bills</div>
          </div>
        );
      },
    },
    {
      key: "recent",
      label: "Last 30 days",
      minWidth: 140,
      align: "right",
      render: (_v, row) => {
        const s = row as ShopDetail;
        return (
          <div>
            <div style={{ fontWeight: 600 }}>{fmtMoney(s.revenue30d)}</div>
            <div className={styles.muted}>{fmtNum(s.orders30d)} bills</div>
          </div>
        );
      },
    },
    {
      key: "last",
      label: "Last bill",
      minWidth: 120,
      render: (_v, row) => fmtDate((row as ShopDetail).lastOrderAt),
    },
  ];

  const userColumns: AppTableColumn[] = [
    {
      key: "name",
      label: "Person",
      minWidth: 220,
      render: (_v, row) => {
        const u = row as UserDetail;
        return (
          <div>
            <div style={{ fontWeight: 600 }}>{u.name || u.email}</div>
            {u.name ? <div className={styles.muted}>{u.email}</div> : null}
          </div>
        );
      },
    },
    {
      key: "role",
      label: "Role",
      minWidth: 120,
      render: (_v, row) => (
        <Tag>{(row as UserDetail).role.replace("_", " ").toLowerCase()}</Tag>
      ),
    },
    { key: "shop", label: "Shop", minWidth: 110, render: (_v, row) => (row as UserDetail).shopCode },
    {
      key: "status",
      label: "Status",
      minWidth: 100,
      render: (_v, row) =>
        (row as UserDetail).isActive ? (
          <Tag color="green">Active</Tag>
        ) : (
          <Tag color="red">Disabled</Tag>
        ),
    },
    {
      key: "joined",
      label: "Joined",
      minWidth: 120,
      render: (_v, row) => fmtDate((row as UserDetail).createdAt),
    },
    {
      key: "actions",
      label: "",
      minWidth: 150,
      align: "right",
      render: (_v, row) => {
        const u = row as UserDetail;
        return (
          <Popconfirm
            title={`Email a password reset code to ${u.email}?`}
            description="They enter it on the Forgot password screen. It expires in 5 minutes."
            okText="Send"
            onConfirm={() => void sendReset(u)}
            disabled={org.isDemo}
          >
            <Button size="small" disabled={org.isDemo}>
              Send password reset
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <>
      <Link href="/operator/businesses" className={styles.back}>
        ← Businesses
      </Link>

      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>
            {org.name} <StateTag {...sub} isDemo={org.isDemo} />
          </h1>
          <p className={styles.sub}>
            Joined {fmtDate(org.createdAt)}
            {org.owner ? ` · owner ${org.owner.name || org.owner.email}` : ""}
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            type="primary"
            disabled={org.isDemo || grandfathered}
            onClick={() => setAction("activate")}
          >
            Activate plan
          </Button>
          <Button disabled={org.isDemo || sub.state === "ACTIVE"} onClick={() => setAction("extend")}>
            Extend trial
          </Button>
          <Popconfirm
            title={`Make ${org.name} read-only now?`}
            description="They keep their data but can no longer change it."
            okText="Revoke"
            okButtonProps={{ danger: true }}
            onConfirm={() => void revoke()}
            disabled={org.isDemo}
          >
            <Button danger disabled={org.isDemo || sub.state === "EXPIRED"}>
              Revoke access
            </Button>
          </Popconfirm>
        </div>
      </div>

      <div className={styles.stats}>
        <Stat label="All-time sales" value={fmtMoney(org.totals.revenue)} note={`${fmtNum(org.totals.orders)} bills`} />
        <Stat label="Last 30 days" value={fmtMoney(org.totals.revenue30d)} note={`${fmtNum(org.totals.orders30d)} bills`} />
        <Stat label="Shops" value={fmtNum(org.totals.shops)} />
        <Stat label="People" value={fmtNum(org.totals.users)} />
        <Stat label="Products" value={fmtNum(org.totals.products)} />
        <Stat label="Customers" value={fmtNum(org.totals.customers)} />
      </div>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <div className={styles.cardHead}>Plan</div>
          <div className={styles.cardBody}>
            <dl className={styles.kv}>
              <dt>Status</dt>
              <dd>
                <StateTag {...sub} isDemo={org.isDemo} />
              </dd>
              <dt>Plan</dt>
              <dd>{sub.planName ?? "—"}</dd>
              <dt>Trial ends</dt>
              <dd>{fmtDate(sub.trialEndsAt)}</dd>
              <dt>Paid until</dt>
              <dd>{sub.paidUntil ? fmtDate(sub.paidUntil) : grandfathered ? "No expiry" : "—"}</dd>
              <dt>Set-up finished</dt>
              <dd>{org.onboardingCompletedAt ? fmtDate(org.onboardingCompletedAt) : "Not yet"}</dd>
            </dl>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            Plan requests
            <span className={styles.cardHint}>{org.enquiries.length} total</span>
          </div>
          {org.enquiries.length === 0 ? (
            <div className={styles.empty}>This business has not asked for a plan.</div>
          ) : (
            <ul className={styles.list}>
              {org.enquiries.map((e) => (
                <li key={e.id} className={styles.item} style={{ alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 550 }}>
                      {e.contactName} · {e.email}
                      {e.phone ? ` · ${e.phone}` : ""}
                    </div>
                    {e.plan ? <div className={styles.itemMeta}>{e.plan}</div> : null}
                    {e.message ? (
                      <div className={styles.itemMeta} style={{ whiteSpace: "pre-wrap" }}>
                        {e.message}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <Tag color={e.status === "OPEN" ? "orange" : e.status === "CONTACTED" ? "blue" : "default"}>
                      {e.status.toLowerCase()}
                    </Tag>
                    <div className={styles.itemMeta}>{fmtDate(e.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={styles.section}>
        <h2 className={styles.h1} style={{ fontSize: "1.05rem", marginBottom: 10 }}>
          Shops
        </h2>
        <DataTable columns={shopColumns} data={org.shops} rowKey="id" pageSize={10} emptyTitle="No shops" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h1} style={{ fontSize: "1.05rem", marginBottom: 10 }}>
          People
        </h2>
        <DataTable columns={userColumns} data={org.users} rowKey="id" pageSize={10} emptyTitle="No users" />
      </section>

      {action ? (
        <ActionModal
          kind={action}
          orgId={org.id}
          orgName={org.name}
          currentPlan={sub.planName}
          onClose={() => setAction(null)}
          onDone={reload}
        />
      ) : null}
    </>
  );
}
