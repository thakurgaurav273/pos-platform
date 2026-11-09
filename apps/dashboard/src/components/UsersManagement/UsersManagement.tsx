"use client";

import { App, Button, Checkbox, Form, Input, Modal, Select, Switch, Tooltip } from "antd";
import { Building2, UserPlus, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataTable, type AppTableColumn } from "@/components/DataTable/DataTable";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { apiFetch, getApiBaseUrl, getAuthHeaders } from "@/lib/api";
import type { RolePermissions } from "@/contexts/AuthContext";
import {
  computeOverridesFromDraft,
  getPermissionsForRole,
  PERMISSION_ROWS,
  ROLE_FORM_OPTIONS,
  ROLE_PERMISSION_FIELD_KEYS,
} from "@/lib/rolePermissions";
import { ShieldAlert } from "lucide-react";
import styles from "./UsersManagement.module.css";

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  shopCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    MANAGER: "Manager",
    CASHIER: "Cashier",
    STAFF: "Staff",
  };
  return map[role] ?? role;
}

function rolePillModifier(role: string): string {
  const map: Record<string, string> = {
    SUPER_ADMIN: "users-pill--super_admin",
    ADMIN: "users-pill--admin",
    MANAGER: "users-pill--manager",
    CASHIER: "users-pill--cashier",
    STAFF: "users-pill--staff",
  };
  return map[role] ?? "users-pill--role-default";
}

function canDeleteUserRow(
  authRole: string | undefined,
  authUserId: string | undefined,
  row: UserRow,
): boolean {
  if (!authRole || !authUserId || row.id === authUserId) return false;
  if (authRole === "SUPER_ADMIN") return true;
  if (authRole === "ADMIN") return row.role !== "SUPER_ADMIN" && row.role !== "ADMIN";
  if (authRole === "MANAGER") return row.role === "CASHIER" || row.role === "STAFF";
  return false;
}

function enabledPermissionKeys(role: string): (keyof RolePermissions)[] {
  const defaults = getPermissionsForRole(role);
  return ROLE_PERMISSION_FIELD_KEYS.filter((k) => defaults[k]);
}

export default function UsersManagement() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const { user: authUser } = useAuth();
  const baseUrl = getApiBaseUrl();
  const { effectiveShopCode, shops, shopsLoading } = useShop();

  const canManageUserRows =
    authUser?.role === "SUPER_ADMIN" || authUser?.role === "ADMIN";

  const readyForTable = !shopsLoading && effectiveShopCode.length > 0;
  const [refreshKey, setRefreshKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createForm] = Form.useForm();

  const navigateToEditRef = useRef<(row: UserRow) => void>(() => {});
  useEffect(() => {
    navigateToEditRef.current = (row: UserRow) => {
      router.push(`/users/${row.id}`);
    };
  }, [router]);

  const requestDeleteRef = useRef<(row: UserRow) => void>(() => {});
  useEffect(() => {
    requestDeleteRef.current = (row: UserRow) => {
      modal.confirm({
        title: "Remove this user?",
        content: `Remove ${row.email} from this shop? They will no longer be able to sign in. Users with sales or stock history are deactivated instead of deleted, so their records stay traceable.`,
        okText: "Remove user",
        okType: "danger",
        cancelText: "Cancel",
        onOk: async () => {
          const res = await apiFetch(`/users/${row.id}`, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            message.error(
              typeof data?.message === "string"
                ? data.message
                : Array.isArray(data?.message)
                  ? data.message.join(", ")
                  : "Could not remove user",
            );
            throw new Error(String(data?.message ?? res.statusText));
          }
          message.success(
            data?.deactivated ? "User deactivated (has sales history)" : "User removed",
          );
          setRefreshKey((k) => k + 1);
        },
      });
    };
  }, [message, modal]);

  const generateStrongPassword = useCallback(() => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }, []);

  const handleSuggestPassword = useCallback(() => {
    createForm.setFieldsValue({ password: generateStrongPassword() });
    message.success("Strong password suggested and auto-filled");
  }, [createForm, generateStrongPassword, message]);

  const columns: AppTableColumn[] = useMemo(() => {
    const base: AppTableColumn[] = [
      {
        key: "email",
        label: "Email",
        field: "email",
        minWidth: 210,
        render: (val) => (
          <span className="users-email">{String(val ?? "")}</span>
        ),
      },
      {
        key: "name",
        label: "Name",
        field: "name",
        minWidth: 120,
        render: (_, row) => {
          const r = row as UserRow;
          const v = r.name?.trim();
          if (!v) return <span className="users-name-muted">-</span>;
          return <span>{v}</span>;
        },
      },
      {
        key: "role",
        label: "Role",
        field: "role",
        width: 160,
        align: "center",
        render: (val) => {
          const role = String(val ?? "");
          return (
            <span className={`users-pill ${rolePillModifier(role)}`}>
              {roleLabel(role)}
            </span>
          );
        },
      },
      {
        key: "shopCode",
        label: "Shop",
        field: "shopCode",
        width: 180,
        align: "center",
        render: (val) => (
          <span className="users-pill users-pill--shop">{String(val ?? "")}</span>
        ),
      },
      {
        key: "isActive",
        label: "Status",
        field: "isActive",
        width: 100,
        align: "center",
        render: (val) => {
          const active = Boolean(val);
          return (
            <span className={`users-pill ${active ? "users-pill--active" : "users-pill--inactive"}`}>
              {active ? "Active" : "Inactive"}
            </span>
          );
        },
      },
      {
        key: "createdAt",
        label: "Created",
        field: "createdAt",
        width: 168,
        render: (val) => formatDt(String(val ?? "")),
      },
    ];

    if (canManageUserRows) {
      base.push({
        key: "_actions",
        label: "Actions",
        width: 180,
        render: (_, row) => {
          const r = row as UserRow;
          return (
            <div className="flex items-center justify-start gap-2">
              <Tooltip title="Edit">
              <Button
                type="text"
                size="small"
                className="text-[var(--bistre-600)] hover:text-[var(--ochre-600)] hover:bg-[var(--ochre-50)]"
                aria-label={`Edit ${r.email}`}
                icon={<Pencil size={16} aria-hidden />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigateToEditRef.current(r);
                }}
              />
            </Tooltip>
            {canDeleteUserRow(authUser?.role, authUser?.id, r) && (
              <Tooltip title="Delete">
                <Button
                  type="text"
                  danger
                  size="small"
                  aria-label={`Delete ${r.email}`}
                  icon={<Trash2 size={16} aria-hidden />}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    requestDeleteRef.current(r);
                  }}
                />
              </Tooltip>
            )}
          </div>
          );
        },
      });
    }
    return base;
  }, [authUser?.id, authUser?.role, canManageUserRows]);

  const filterKey = `${effectiveShopCode}|${refreshKey}`;

  const fetchFn = useMemo(() => {
    if (!readyForTable) return undefined;
    return ({ page, pageSize }: { page: number; pageSize: number }) => {
      const u = new URL(
        `${baseUrl}/users`,
        typeof window !== "undefined" ? window.location.origin : "http://localhost",
      );
      u.searchParams.set("page", String(page));
      u.searchParams.set("size", String(pageSize));
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
  }, [baseUrl, effectiveShopCode, readyForTable]);

  const shopOptions = useMemo(() => {
    if (shops.length > 0) {
      return shops.map((s) => ({ value: s.shopCode, label: `${s.name} (${s.shopCode})` }));
    }
    if (effectiveShopCode) {
      return [{ value: effectiveShopCode, label: effectiveShopCode }];
    }
    return [];
  }, [shops, effectiveShopCode]);

  useEffect(() => {
    if (!createOpen) return;
    createForm.setFieldsValue({
      shopCode: effectiveShopCode,
      role: "STAFF",
      permissions: enabledPermissionKeys("STAFF"),
    });
  }, [createOpen, effectiveShopCode, createForm]);

  const onCreateSubmit = async (values: {
    email: string;
    password: string;
    name?: string;
    role: string;
    shopCode: string;
    permissions?: (keyof RolePermissions)[];
  }) => {
    setSubmitting(true);
    const enabled = new Set(values.permissions ?? enabledPermissionKeys(values.role));
    const draft = Object.fromEntries(
      ROLE_PERMISSION_FIELD_KEYS.map((k) => [k, enabled.has(k)]),
    ) as RolePermissions;
    try {
      const res = await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          name: values.name || undefined,
          role: values.role,
          shopCode: values.shopCode,
          permissionOverrides: computeOverridesFromDraft(values.role, draft),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(
          typeof data?.message === "string"
            ? data.message
            : Array.isArray(data?.message)
              ? data.message.join(", ")
              : "Could not create user",
        );
        return;
      }
      message.success("User created");
      setCreateOpen(false);
      createForm.resetFields();
      setRefreshKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className={styles.root}>
      <PageHeader
        className="border-b border-[var(--pearl-bush)] pb-4 mb-4"
        title="Users"
        actions={
        <Button
          type="primary"
          className="rounded-lg shadow-sm font-semibold shrink-0"
          style={{ backgroundColor: 'var(--ochre-600)', borderColor: 'var(--ochre-600)' }}
          icon={<UserPlus size={16} strokeWidth={2.25} />}
          onClick={() => setCreateOpen(true)}
        >
          Add user
        </Button>
        }
      />

      <div className={`${styles.tableSlot} ${styles.wrap}`}>
        {fetchFn && (
          <DataTable
            key={`${effectiveShopCode}-${canManageUserRows ? "e" : "v"}`}
            columns={columns}
            fetchFn={fetchFn}
            filterKey={filterKey}
            pageSize={20}
            pageSizeOptions={[10, 20, 50]}
            maxBodyHeight={520}
            emptyTitle="No users found"
            emptyDescription="Add your team members and assign them roles to start managing your shop."
            emptyIcon={<ShieldAlert size={28} strokeWidth={1.35} aria-hidden />}
          />
        )}
      </div>

      <Modal
        title={<span className={styles.modalTitle}>Add user</span>}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={onCreateSubmit}
          onValuesChange={(changed: { role?: string }) => {
            // A new role starts from that role's defaults; tweak from there.
            if (changed.role) {
              createForm.setFieldValue("permissions", enabledPermissionKeys(changed.role));
            }
          }}
        >
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label={
              <div className="flex items-center justify-between w-full">
                <span>Password</span>
                <Button
                  type="link"
                  size="small"
                  className="h-auto p-0 text-[11px] font-semibold text-[var(--ochre-600)]"
                  onClick={() => handleSuggestPassword()}
                >
                  Suggest strong password
                </Button>
              </div>
            }
            rules={[{ required: true, min: 6 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="name" label="Name">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={[...ROLE_FORM_OPTIONS]} />
          </Form.Item>
          <Form.Item
            name="shopCode"
            label="Shop"
            rules={[{ required: true, message: "Select a shop" }]}
          >
            <Select options={shopOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item
            name="permissions"
            label="Access"
            extra="Starts from the role's defaults. Changes are saved as overrides for this user."
          >
            <Checkbox.Group
              className="grid grid-cols-2 gap-y-1"
              options={PERMISSION_ROWS.map((r) => ({ label: r.label, value: r.key }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              Create
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
