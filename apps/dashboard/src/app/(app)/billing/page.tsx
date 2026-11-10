"use client";

import { useState } from "react";
import { App, Button, Form, Input, Select } from "antd";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { SectionCard } from "@/components/SectionCard/SectionCard";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { apiFetch } from "@/lib/api";

const PLAN_OPTIONS = ["Single shop", "Multiple shops", "Not sure yet"].map(
  (v) => ({
    value: v,
    label: v,
  }),
);

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

type EnquiryForm = {
  contactName: string;
  email: string;
  phone?: string;
  plan?: string;
  message?: string;
};

export default function BillingPage() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { status, refresh } = useSubscription();
  const [form] = Form.useForm<EnquiryForm>();
  const [submitting, setSubmitting] = useState(false);

  const canRequest = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const phone = (user as { phone?: string | null } | null)?.phone ?? undefined;

  let headline = "Loading…";
  let detail = "";
  if (status?.state === "TRIAL") {
    headline = "Free trial";
    detail = `Ends on ${fmtDate(status.trialEndsAt)} (${status.daysLeft} ${status.daysLeft === 1 ? "day" : "days"} left). Everything is available during the trial.`;
  } else if (status?.state === "ACTIVE") {
    headline = status.planName ? `${status.planName} plan` : "Active";
    detail = status.paidUntil
      ? `Active until ${fmtDate(status.paidUntil)}.`
      : "Your account is active with no end date.";
  } else if (status?.state === "EXPIRED") {
    headline = "Trial ended";
    detail =
      "Your business is read-only: you can view and export your data, but creating bills and changing stock or products is turned off until a plan is activated.";
  }

  const onFinish = async (values: EnquiryForm) => {
    setSubmitting(true);
    try {
      const res = await apiFetch("/billing/enquiries", {
        method: "POST",
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        message.error(
          typeof payload?.message === "string"
            ? payload.message
            : "Could not send your request.",
        );
        return;
      }
      message.success("Request sent. We will contact you soon.");
      form.setFieldsValue({ message: undefined });
      await refresh();
    } catch {
      message.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Plan & billing"
        description="Your trial, your plan, and how to move to a paid plan."
      />

      <SectionCard title="Current status">
        <div className="px-5 py-4">
          <p className="m-0 text-xl font-semibold text-[var(--text-primary)]">
            {headline}
          </p>
          <p className="mt-1 mb-0 text-[var(--text-secondary)]">{detail}</p>
        </div>
      </SectionCard>

      <SectionCard
        title="Request a plan"
        description="Tell us how to reach you and we will set up your plan and send an invoice."
      >
        <div className="px-5 py-4">
          {!canRequest ? (
            <p className="m-0 text-[var(--text-secondary)]">
              Only the shop owner or an admin can request a plan. Please ask
              them to open this page.
            </p>
          ) : (
            <>
              {status?.openEnquiry ? (
                <p className="mb-4 rounded-lg border border-[var(--border-strong)] bg-[rgba(var(--ochre-rgb),0.08)] px-4 py-3 text-sm text-[var(--text-primary)]">
                  We received your request on{" "}
                  {fmtDate(status.openEnquiry.createdAt)} and will be in touch.
                  You can send another note below if something has changed.
                </p>
              ) : null}
              <Form
                form={form}
                layout="vertical"
                requiredMark={false}
                onFinish={onFinish}
                initialValues={{
                  contactName: user?.name ?? "",
                  email: user?.email ?? "",
                  phone,
                }}
              >
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Form.Item
                    name="contactName"
                    label="Your name"
                    rules={[
                      { required: true, message: "Please enter your name." },
                    ]}
                  >
                    <Input autoComplete="name" />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      { required: true, message: "Please enter your email." },
                      { type: "email", message: "Enter a valid email." },
                    ]}
                  >
                    <Input autoComplete="email" />
                  </Form.Item>
                  <Form.Item name="phone" label="Phone (optional)">
                    <Input autoComplete="tel" />
                  </Form.Item>
                  <Form.Item name="plan" label="What do you need?">
                    <Select
                      allowClear
                      placeholder="Select"
                      options={PLAN_OPTIONS}
                    />
                  </Form.Item>
                </div>
                <Form.Item
                  name="message"
                  label="Anything we should know? (optional)"
                >
                  <Input.TextArea rows={3} maxLength={1000} showCount />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={submitting}>
                  Send request
                </Button>
              </Form>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
