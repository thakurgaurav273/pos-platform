"use client";

import { useState } from "react";
import { App, Form, Input, Modal, Select, Tag } from "antd";
import { operatorRequest } from "@/lib/operatorSession";
import { fmtDate, type OrgState } from "./types";

const MONTH_OPTIONS = [1, 3, 6, 12, 24].map((m) => ({
  value: m,
  label: `${m} ${m === 1 ? "month" : "months"}`,
}));
const TRIAL_DAY_OPTIONS = [7, 14, 30].map((d) => ({ value: d, label: `${d} days` }));

type TagProps = {
  state: OrgState;
  daysLeft: number | null;
  planName: string | null;
  paidUntil: string | null;
  isDemo?: boolean;
};

export function StateTag({ state, daysLeft, planName, paidUntil, isDemo }: TagProps) {
  if (isDemo) return <Tag>Demo</Tag>;
  if (state === "TRIAL") return <Tag color="blue">Trial · {daysLeft}d left</Tag>;
  if (state === "ACTIVE") {
    return (
      <span>
        <Tag color="green">Active{planName ? ` · ${planName}` : ""}</Tag>
        <span style={{ color: "#6b7280", fontSize: 12 }}>
          {paidUntil ? `until ${fmtDate(paidUntil)}` : "no expiry"}
        </span>
      </span>
    );
  }
  return <Tag color="red">Expired</Tag>;
}

export type OrgActionKind = "activate" | "extend";

/** Activate-plan / extend-trial dialog. Mount it only while open so its form always exists. */
export function ActionModal({
  kind,
  orgId,
  orgName,
  currentPlan,
  onClose,
  onDone,
}: {
  kind: OrgActionKind;
  orgId: string;
  orgName: string;
  currentPlan: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ planName: string; months: number; days: number }>();
  const [saving, setSaving] = useState(false);
  const activating = kind === "activate";

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    const r = await operatorRequest(
      `/organizations/${orgId}/${activating ? "activate" : "extend-trial"}`,
      {
        method: "POST",
        body: JSON.stringify(
          activating ? { planName: v.planName, months: v.months } : { days: v.days },
        ),
      },
    );
    setSaving(false);
    if (!r.ok) return message.error(r.message ?? "That did not work.");
    message.success(activating ? "Plan activated." : "Trial extended.");
    onClose();
    onDone();
  };

  return (
    <Modal
      open
      title={activating ? `Activate plan for ${orgName}` : `Extend trial for ${orgName}`}
      okText={activating ? "Activate" : "Extend"}
      confirmLoading={saving}
      onOk={() => void submit()}
      onCancel={onClose}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={
          activating ? { planName: currentPlan ?? "Standard", months: 12 } : { days: 7 }
        }
      >
        {activating ? (
          <>
            <Form.Item
              name="planName"
              label="Plan name"
              rules={[{ required: true, message: "Enter a plan name." }]}
            >
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item name="months" label="Paid for" rules={[{ required: true }]}>
              <Select options={MONTH_OPTIONS} />
            </Form.Item>
            <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
              Time is added after any period they have already paid for.
            </p>
          </>
        ) : (
          <Form.Item name="days" label="Extend by" rules={[{ required: true }]}>
            <Select options={TRIAL_DAY_OPTIONS} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
