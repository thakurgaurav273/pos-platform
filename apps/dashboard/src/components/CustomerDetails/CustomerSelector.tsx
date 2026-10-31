'use client';

import { Button, Segmented, Select, Spin, Tooltip } from 'antd';
import { Pencil, RefreshCw, Search, UserPlus, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuth } from '@/contexts/AuthContext';
import { customerFromApi, type CustomerFormValues } from '.';

type ApiCustomer = Parameters<typeof customerFromApi>[0];

type CustomerTab = 'walkin' | 'saved';

export type CustomerSelectorProps = {
  customer: CustomerFormValues | null;
  setCustomer: (value: CustomerFormValues | null) => void;
  /** Opens the customer modal: edits `customer` when attached, else adds a new one. */
  onOpenDetails: () => void;
};

const SEARCH_LIMIT = 20;

/**
 * Current-sale customer picker: Walk-in (no customer, the default) or a saved customer
 * searched by name or phone in the active shop. Once attached, shows a card with
 * Change / Edit / Remove.
 */
export default function CustomerSelector({
  customer,
  setCustomer,
  onOpenDetails,
}: CustomerSelectorProps) {
  const { permissions } = useAuth();
  // Saved records need billing or orders access (mirrors PATCH /customers/:id); a
  // customer typed in for this sale only is always editable.
  const canEditSaved = Boolean(
    permissions?.canAccessBilling || permissions?.canAccessOrders,
  );
  const [tab, setTab] = useState<CustomerTab>('walkin');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [results, setResults] = useState<ApiCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set by "Change" so clearing the customer keeps the Saved tab open for a new search.
  const keepSavedTabRef = useRef(false);

  // Customer cleared elsewhere (Remove, completed sale) -> back to Walk-in.
  useEffect(() => {
    if (customer) return;
    if (keepSavedTabRef.current) {
      keepSavedTabRef.current = false;
      return;
    }
    setTab('walkin');
    setQuery('');
  }, [customer]);

  useEffect(() => {
    if (tab !== 'saved' || customer) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: String(SEARCH_LIMIT) });
    const q = debouncedQuery.trim();
    if (q) params.set('q', q);
    void (async () => {
      try {
        const res = await apiFetch(`/customers?${params.toString()}`);
        if (ignore) return;
        if (!res.ok) {
          setResults([]);
          setError('Could not load customers');
          return;
        }
        const rows = (await res.json()) as ApiCustomer[];
        if (!ignore) setResults(Array.isArray(rows) ? rows : []);
      } catch {
        if (!ignore) {
          setResults([]);
          setError('Network error while searching customers');
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [tab, customer, debouncedQuery]);

  const pick = (id: string) => {
    const row = results.find((r) => r.id === id);
    if (row) setCustomer(customerFromApi(row));
  };

  if (customer) {
    const canEdit = !customer.id || canEditSaved;
    return (
      <div className="rounded-xl border border-[var(--pearl-bush)] bg-[var(--parchment)] px-3 py-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ochre-100)] text-[var(--ochre-600)]">
              <UserRound className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--bistre-400)]">
                {customer.id ? 'Saved customer' : 'Customer'}
              </p>
              <p
                className="truncate font-semibold text-[var(--text-primary)]"
                title={customer.name}
              >
                {customer.name}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Tooltip title="Change customer">
              <button
                type="button"
                onClick={() => {
                  keepSavedTabRef.current = true;
                  setTab('saved');
                  setCustomer(null);
                }}
                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--ochre-10)] hover:text-[var(--ochre-600)]"
                aria-label="Change customer"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </button>
            </Tooltip>
            {canEdit ? (
              <Tooltip title="Edit customer">
                <button
                  type="button"
                  onClick={onOpenDetails}
                  className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--ochre-10)] hover:text-[var(--ochre-600)]"
                  aria-label="Edit customer"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
              </Tooltip>
            ) : null}
            <Tooltip title="Remove (walk-in)">
              <button
                type="button"
                onClick={() => setCustomer(null)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                aria-label="Remove customer from sale"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </Tooltip>
          </div>
        </div>
        <p className="pl-11 text-sm text-[var(--text-secondary)]">{customer.phone}</p>
        {customer.gstin?.trim() ? (
          <p className="pl-11 font-mono text-xs text-[var(--text-secondary)]">
            GSTIN {customer.gstin.trim()}
          </p>
        ) : null}
        {customer.email ? (
          <p className="mt-0.5 truncate pl-11 text-xs text-[var(--text-muted)]" title={customer.email}>
            {customer.email}
          </p>
        ) : null}
        {customer.address ? (
          <p className="mt-1 pl-11 text-xs leading-snug text-[var(--text-muted)] line-clamp-2">
            {customer.address}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Segmented<CustomerTab>
        block
        size="small"
        value={tab}
        onChange={setTab}
        options={[
          { label: 'Walk-in', value: 'walkin' },
          { label: 'Saved customer', value: 'saved' },
        ]}
        aria-label="Customer type"
      />
      {tab === 'walkin' ? (
        <p className="px-1 text-xs text-[var(--text-muted)]">
          Billing as walk-in. No customer is needed.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Select<string>
            className="min-w-0 flex-1"
            showSearch
            autoFocus
            value={null}
            placeholder="Search name or phone"
            filterOption={false}
            onSearch={setQuery}
            searchValue={query}
            onSelect={pick}
            suffixIcon={<Search className="h-4 w-4" aria-hidden />}
            notFoundContent={
              loading ? (
                <Spin size="small" />
              ) : error ? (
                <span className="text-xs text-[var(--danger)]">{error}</span>
              ) : (
                <span className="text-xs text-[var(--text-muted)]">
                  No matching customers
                </span>
              )
            }
            options={results.map((r) => ({
              value: r.id,
              label: (
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate" title={r.name}>
                    {r.name}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    {r.phone}
                  </span>
                </div>
              ),
            }))}
            aria-label="Search saved customers"
          />
          <Tooltip title="New customer">
            <Button
              className="!flex shrink-0 items-center justify-center"
              icon={<UserPlus className="h-4 w-4" aria-hidden />}
              onClick={onOpenDetails}
              aria-label="Add new customer"
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
}
