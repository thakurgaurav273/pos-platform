"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  App,
  Breadcrumb,
  Button,
  Checkbox,
  Col,
  Collapse,
  Form,
  Input,
  Row,
  Select,
  Switch,
} from "antd";

import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import type { RolePermissions } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import {
  computeOverridesFromDraft,
  getPermissionsForRole,
  mergeEffectivePermissions,
  PERMISSION_ROWS,
  ROLE_FORM_OPTIONS,
} from "@/lib/rolePermissions";
import { useShop } from "@/contexts/ShopContext";

import styles from "./edit-user.module.css";

function legacyRoleLabel(role: string): string {
  const m: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    MANAGER: "Manager",
    CASHIER: "Cashier",
    STAFF: "Staff",
  };
  return m[role] ?? role;
}

export type UserDetail = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  shopCode: string;
  isActive: boolean;
  permissionOverrides?: unknown | null;
  createdAt: string;
  updatedAt: string;
};

function clonePerms(p: RolePermissions): RolePermissions {
  return { ...p };
}

type EditUserFormShellProps = {
  user: UserDetail;
  onUserUpdated: () => Promise<void>;
};

/**
 * Isolated so `Form.useForm()` always mounts with a `<Form form={...}>`, which avoids Ant Design
 * "not connected to any Form" when the parent shows a skeleton first.
 */
function EditUserFormShell({ user, onUserUpdated }: EditUserFormShellProps) {
  const { message } = App.useApp();
  const router = useRouter();
  const { user: authUser, token: authToken, setAuth } = useAuth();
  const { shops } = useShop();
  const [form] = Form.useForm();
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<RolePermissions>(() =>
    clonePerms(mergeEffectivePermissions(user.role, user.permissionOverrides)),
  );
  const [draft, setDraft] = useState<RolePermissions>(() =>
    clonePerms(mergeEffectivePermissions(user.role, user.permissionOverrides)),
  );

  const shopOptions = useMemo(
    () =>
      shops.map((s) => ({
        value: s.shopCode,
        label: `${s.name} (${s.shopCode})`,
      })),
    [shops],
  );

  const roleSelectOptions = useMemo((): { value: string; label: string }[] => {
    const base: { value: string; label: string }[] = ROLE_FORM_OPTIONS.map(
      (o) => ({ value: o.value, label: o.label }),
    );
    const r = user.role;
    if (r && !base.some((o) => o.value === r)) {
      base.push({ value: r, label: `${legacyRoleLabel(r)} (legacy)` });
    }
    return base;
  }, [user.role]);

  const overridesKey = useMemo(
    () => JSON.stringify(user.permissionOverrides ?? null),
    [user.permissionOverrides],
  );

  useEffect(() => {
    const eff = mergeEffectivePermissions(user.role, user.permissionOverrides);
    setSavedSnapshot(clonePerms(eff));
    setDraft(clonePerms(eff));
    form.setFieldsValue({
      name: user.name ?? "",
      role: user.role,
      shopCode: user.shopCode,
      isActive: user.isActive,
      password: "",
    });
  }, [
    user.id,
    user.updatedAt,
    user.role,
    user.shopCode,
    user.isActive,
    user.name,
    overridesKey,
    form,
  ]);

  const generateStrongPassword = () => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    form.setFieldsValue({ password: pwd });
    message.success("Strong password suggested and auto-filled");
  };

  const refreshSessionPermissionsIfSelf = async () => {
    if (authToken && authUser?.id === user.id) {
      const pr = await apiFetch("/settings/role-permissions");
      if (pr.ok) {
        const perm = (await pr.json()) as RolePermissions;
        setAuth(authToken, authUser, perm);
      }
    }
  };

  const submitPatch = async (body: Record<string, unknown>, okMsg: string) => {
    try {
      const res = await apiFetch(`/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(
          typeof errBody?.message === "string"
            ? errBody.message
            : Array.isArray(errBody?.message)
              ? errBody.message.join(", ")
              : "Could not update user",
        );
        return false;
      }
      message.success(okMsg);
      await refreshSessionPermissionsIfSelf();
      await onUserUpdated();
      return true;
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const onSaveAccount = async () => {
    try {
      const values = await form.validateFields();
      setSavingAccount(true);
      const body: Record<string, unknown> = {
        name: values.name?.trim() ? values.name.trim() : null,
        role: values.role,
        shopCode: values.shopCode,
        isActive: values.isActive,
      };
      if (values.password && String(values.password).length >= 6) {
        body.password = values.password;
      }
      await submitPatch(body, "Account saved");
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAccount(false);
    }
  };

  const onSavePermissions = async () => {
    const role = form.getFieldValue("role") as string | undefined;
    if (!role) {
      message.warning(
        "Set a role under Account details before saving permissions.",
      );
      return;
    }
    setSavingPermissions(true);
    try {
      await submitPatch(
        {
          role,
          permissionOverrides: computeOverridesFromDraft(role, draft),
        },
        "Permissions saved",
      );
    } finally {
      setSavingPermissions(false);
    }
  };

  const resetDraftToSaved = () => {
    setDraft(clonePerms(savedSnapshot));
  };

  const resetDraftToRoleDefaults = () => {
    const r = form.getFieldValue("role") as string | undefined;
    if (r) setDraft(getPermissionsForRole(r));
  };

  return (
    <div className={styles.pageShell}>
      <Breadcrumb
        className={`shrink-0 text-sm ${styles.breadcrumb}`}
        items={[
          {
            title: (
              <Link
                href="/dashboard"
                className="text-[var(--ochre-600)] hover:underline"
              >
                Home
              </Link>
            ),
          },
          {
            title: (
              <Link
                href="/users"
                className="text-[var(--ochre-600)] hover:underline"
              >
                Users
              </Link>
            ),
          },
          {
            title: (
              <span className="text-[var(--text-secondary)]">
                {user.email}
              </span>
            ),
          },
        ]}
      />

      <header className={styles.pageHeader}>
        <div className={styles.headerCopy}>
          <h1 className={styles.headerTitle}>Edit team member</h1>
          <p className={styles.headerEmail}>{user.email}</p>
        </div>
        <Button
          className={styles.backBtn}
          onClick={() => router.push("/users")}
        >
          Back to directory
        </Button>
      </header>

      <Collapse
        bordered={false}
        className={styles.collapse}
        defaultActiveKey={["account", "permissions"]}
        items={[
          {
            key: "account",
            label: "Account details",
            children: (
              <>
                <Form
                  form={form}
                  layout="vertical"
                  className={styles.formBlock}
                  requiredMark="optional"
                  onValuesChange={(changed) => {
                    if ("role" in changed && changed.role != null) {
                      setDraft(getPermissionsForRole(String(changed.role)));
                    }
                  }}
                >
                  <Row gutter={[16, 0]}>
                    <Col xs={24} md={12}>
                      <Form.Item name="name" label="Name">
                        <Input placeholder="Display name" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="password"
                        label={
                          <span className="flex w-full items-center justify-between gap-2">
                            <span>New password (optional)</span>
                            <Button
                              type="link"
                              size="small"
                              className="h-auto shrink-0 p-0 text-[11px] font-semibold text-[var(--ochre-600)]"
                              onClick={generateStrongPassword}
                            >
                              Suggest strong password
                            </Button>
                          </span>
                        }
                      >
                        <Input.Password
                          autoComplete="new-password"
                          placeholder="Leave blank to keep current"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={[16, 0]}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="role"
                        label="Role"
                        rules={[{ required: true }]}
                      >
                        <Select options={roleSelectOptions} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="shopCode"
                        label="Shop"
                        rules={[{ required: true }]}
                      >
                        <Select
                          options={shopOptions}
                          showSearch
                          optionFilterProp="label"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item
                    name="isActive"
                    label="Account active"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                </Form>
                <div className={styles.sectionSaveRow}>
                  <Button
                    type="primary"
                    loading={savingAccount}
                    onClick={() => void onSaveAccount()}
                  >
                    Save account
                  </Button>
                </div>
              </>
            ),
          },
          {
            key: "permissions",
            label: "Permissions",
            children: (
              <>
                <p className={styles.permHint}>
                  <strong>Saved</strong> is what was in effect when you opened this
                  page (or after your last save). <strong>Editing</strong> is your
                  working copy. Adjust checkboxes, then save. Unchecked means no
                  access for that area. Only differences from the role defaults are
                  stored.
                </p>
                <div className={styles.permToolbar}>
                  <Button size="small" onClick={resetDraftToSaved}>
                    Reset edits to saved
                  </Button>
                  <Button
                    size="small"
                    type="default"
                    onClick={resetDraftToRoleDefaults}
                  >
                    Match role defaults
                  </Button>
                </div>
                <div className={styles.permTableWrap}>
                  <table className={styles.permTable}>
                    <thead>
                      <tr>
                        <th>Area</th>
                        <th>Saved</th>
                        <th>Editing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PERMISSION_ROWS.map((row) => (
                        <tr key={row.key}>
                          <td className={styles.permAreaCell}>{row.label}</td>
                          <td className={styles.permCheckCell}>
                            <Checkbox checked={savedSnapshot[row.key]} disabled />
                          </td>
                          <td className={styles.permCheckCell}>
                            <Checkbox
                              checked={draft[row.key]}
                              onChange={(e) =>
                                setDraft((prev) =>
                                  prev
                                    ? { ...prev, [row.key]: e.target.checked }
                                    : prev,
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={styles.sectionSaveRow}>
                  <Button
                    type="primary"
                    loading={savingPermissions}
                    onClick={() => void onSavePermissions()}
                  >
                    Save permissions
                  </Button>
                </div>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

export default function EditUserPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;
  const { user: authUser } = useAuth();

  const canManage = useMemo(
    () => authUser?.role === "SUPER_ADMIN" || authUser?.role === "ADMIN",
    [authUser?.role],
  );

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/users/${encodeURIComponent(userId)}`);
      if (!res.ok) {
        if (res.status === 404) {
          message.error("User not found");
          router.replace("/users");
          return;
        }
        const t = await res.text();
        message.error(t || res.statusText);
        return;
      }
      const data = (await res.json()) as UserDetail;
      setUser(data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [userId, message, router]);

  useEffect(() => {
    if (!canManage) {
      router.replace("/users");
      return;
    }
    void load();
  }, [canManage, load, router]);

  if (!canManage) {
    return null;
  }

  if (loading && !user) {
    return <ContentSkeleton variant="detail" rowCount={8} />;
  }

  if (!user) {
    return null;
  }

  return <EditUserFormShell user={user} onUserUpdated={load} />;
}
