'use client';

import { App, Button, InputNumber, Modal, Select, Input } from 'antd';
import { PackagePlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useShop } from '@/contexts/ShopContext';

type VariantOption = {
  id: string;
  barcode: string;
  productName: string;
  variantName: string;
  quantity: number;
  unit: string;
  price: number;
};

type RefillLine = {
  barcode: string;
  productName: string;
  variantName: string;
  quantity: number;
};

interface RefillRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RefillRequestModal({
  open,
  onClose,
  onSuccess,
}: RefillRequestModalProps) {
  const { message } = App.useApp();
  const { shops } = useShop();

  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<RefillLine[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [note, setNote] = useState('');
  const [searchText, setSearchText] = useState('');
  const debouncedSearchText = useDebouncedValue(searchText, 400);

  const factoryShop = shops.find(s => s.isFactory);
  const factoryCode = factoryShop?.shopCode || 'FACTORY01';

  useEffect(() => {
    if (!open) {
      setSearchText('');
      return;
    }

    const ac = new AbortController();
    setLoading(true);

    (async () => {
      const pageSize = 100;
      const maxPages = 500;
      const collected: VariantOption[] = [];

      try {
        for (let page = 1; page <= maxPages; page += 1) {
          if (ac.signal.aborted) return;

          const res = await apiFetch(
            `/inventory/variants?page=${page}&size=${pageSize}`,
            {
              headers: { 'x-shop': factoryCode },
              signal: ac.signal,
            },
          );

          if (!res.ok) throw new Error('Failed to load products from factory');
          const json = (await res.json()) as {
            data?: unknown[];
            last_page?: number;
          };
          const chunk = Array.isArray(json.data) ? json.data : [];

          for (const d of chunk as any[]) {
            collected.push({
              id: d.id,
              barcode: d.barcode ?? '',
              productName: d.productName,
              variantName: d.variantName,
              quantity: d.quantity,
              unit: d.unit ?? 'PC',
              price: d.price,
            });
          }

          const lastPage = Math.max(1, json.last_page ?? page);
          if (page >= lastPage) break;
        }

        if (ac.signal.aborted) return;
        setVariantOptions(collected);
      } catch {
        if (ac.signal.aborted) return;
        message.error(`Could not load Factory inventory (${factoryCode})`);
        setVariantOptions([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [open, factoryCode, message]);

  const handleAddLine = useCallback(() => {
    if (!selectedVariantId) return;
    const variant = variantOptions.find((v) => v.id === selectedVariantId);
    if (!variant) return;

    if (lines.some((l) => l.barcode === variant.barcode)) {
      message.warning('This product is already in the request.');
      return;
    }

    setLines((prev) => [
      ...prev,
      {
        barcode: variant.barcode,
        productName: variant.productName,
        variantName: variant.variantName,
        quantity: qty,
      },
    ]);
    setSelectedVariantId(null);
    setQty(1);
  }, [selectedVariantId, qty, variantOptions, lines, message]);

  const handleRemoveLine = useCallback((barcode: string) => {
    setLines((prev) => prev.filter((l) => l.barcode !== barcode));
  }, []);

  const handleUpdateQty = useCallback((barcode: string, newQty: number) => {
    setLines((prev) =>
      prev.map((l) => (l.barcode === barcode ? { ...l, quantity: newQty } : l)),
    );
  }, []);

  const handleSubmit = async () => {
    if (lines.length === 0) {
      message.warning('Add at least one product to request.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/stock-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: note.trim() || undefined,
          items: lines,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body?.message === 'string'
            ? body.message
            : Array.isArray(body?.message)
              ? body.message.join(', ')
              : 'Failed to submit refill request',
        );
      }
      message.success('Refill request submitted successfully! 🎉');
      setLines([]);
      setNote('');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      message.error(err?.message || 'Failed to submit refill request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setLines([]);
    setNote('');
    setSelectedVariantId(null);
    setQty(1);
    setSearchText('');
    onClose();
  };

  const filteredOptions = variantOptions.filter((v) => {
    if (!debouncedSearchText.trim()) return true;
    const q = debouncedSearchText.toLowerCase();
    return (
      v.productName.toLowerCase().includes(q) ||
      v.variantName.toLowerCase().includes(q) ||
      v.barcode.toLowerCase().includes(q)
    );
  });

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5 text-[var(--ochre-600)]" />
          <span>Request Refill from Factory</span>
        </div>
      }
      open={open}
      onCancel={handleCancel}
      footer={null}
      width={640}
      destroyOnHidden
    >
      <div className="mt-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Select product
            </label>
            <Select
              showSearch
              value={selectedVariantId}
              onChange={(v) => setSelectedVariantId(v)}
              onSearch={(v) => setSearchText(v)}
              placeholder="Search products..."
              loading={loading}
              className="w-full"
              filterOption={false}
              options={filteredOptions.map((v) => {
                const code =
                  v.barcode.length >= 8
                    ? v.barcode.slice(-8)
                    : v.barcode || '-';
                return {
                  value: v.id,
                  label: `${v.productName} · ${v.variantName} (${code})`,
                };
              })}
              notFoundContent={loading ? 'Loading...' : (shops.length > 0 && !factoryShop ? 'No Factory shop configured' : 'No products found at Factory')}
            />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Qty
            </label>
            <InputNumber
              min={0.001}
              step={1}
              precision={3}
              value={qty}
              onChange={(v) => setQty(v ?? 1)}
              className="w-full"
            />
          </div>
          <Button
            type="primary"
            onClick={handleAddLine}
            disabled={!selectedVariantId}
            style={{
              backgroundColor: 'var(--ochre-600)',
              borderColor: 'var(--ochre-600)',
            }}
          >
            Add
          </Button>
        </div>

        {lines.length > 0 && (
          <div className="rounded-xl border border-[var(--pearl-bush)] bg-[var(--linen-95)]">
            <div className="px-4 py-2 text-xs font-medium text-[var(--bistre-400)] border-b border-[var(--pearl-bush)]">
              Items to request ({lines.length})
            </div>
            <ul className="divide-y divide-[var(--pearl-bush)]">
              {lines.map((line) => (
                <li
                  key={line.barcode}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--text-primary)]">
                      {line.productName}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {line.variantName} · {line.barcode.slice(-8)}
                    </p>
                  </div>
                  <InputNumber
                    min={0.001}
                    precision={3}
                    value={line.quantity}
                    onChange={(v) =>
                      handleUpdateQty(line.barcode, v ?? 1)
                    }
                    size="small"
                    className="w-20"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(line.barcode)}
                    className="rounded-lg p-1.5 text-[var(--danger)] transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                    aria-label={`Remove ${line.productName}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Note */}
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
            Note (optional)
          </label>
          <Input.TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any special instructions..."
            rows={2}
            maxLength={500}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-[var(--pearl-bush)] pt-4">
          <Button onClick={handleCancel}>Cancel</Button>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={lines.length === 0}
            style={{
              backgroundColor: 'var(--ochre-600)',
              borderColor: 'var(--ochre-600)',
            }}
          >
            Submit request
          </Button>
        </div>
      </div>
    </Modal>
  );
}
