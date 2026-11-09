'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Table, InputNumber, message, Steps, Divider, Space } from 'antd';
import { Search } from 'lucide-react';
import { antTableOverflowComponents } from '@/components/AntTableOverflowCell/AntTableOverflowCell';
import {
  ThemeConfigurator,
  type BrandingValue,
} from '@/components/ThemeConfigurator/ThemeConfigurator';
import { apiFetch, getApiBaseUrl, getAuthHeaders } from '@/lib/api';
import { DEFAULT_THEME, themeConfigEquals } from '@/lib/theme/presets';

const DEFAULT_BRANDING: BrandingValue = { config: DEFAULT_THEME, logoUrl: null };

/** Step indexes: info -> branding (optional) -> inventory. */
const STEP_INFO = 0;
const STEP_BRANDING = 1;
const STEP_INVENTORY = 2;

interface Variant {
  id: string;
  productName: string;
  variantName: string;
  barcode: string;
  price: number;
  quantity: number;
}

interface CreateShopWizardProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

export default function CreateShopWizard({ open, onCancel, onSuccess }: CreateShopWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [tableLoading, setTableLoading] = useState(false);
  const [branding, setBranding] = useState<BrandingValue>(DEFAULT_BRANDING);
  const [shopName, setShopName] = useState('');

  // Fetch variants from Factory shop when the inventory step opens
  useEffect(() => {
    if (currentStep === STEP_INVENTORY && variants.length === 0) {
      fetchFactoryVariants();
    }
  }, [currentStep]);

  const fetchFactoryVariants = async (q: string = '') => {
    setTableLoading(true);
    try {
      // Always clone from Factory. The browser base URL is the relative "/api" proxy,
      // which `new URL()` rejects, so build a relative path instead.
      const params = new URLSearchParams({ shopCode: 'FACTORY01', page: '1', size: '100' });
      if (q) params.set('q', q);

      const res = await apiFetch(`/inventory/variants?${params}`);
      const result = await res.json();
      if (res.ok) {
        setVariants(result.data || []);
      }
    } catch (err) {
      message.error('Failed to load products from factory');
    } finally {
      setTableLoading(false);
    }
  };

  const handleNext = async () => {
    try {
      const values = await form.validateFields(['name']);
      setShopName(String(values.name ?? ''));
      setCurrentStep(STEP_BRANDING);
    } catch (err) {
      // Validation failed
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      const formData = form.getFieldsValue(true);
      // Skipped or untouched branding means "use the default": send nothing.
      const brandingPayload = {
        ...(themeConfigEquals(branding.config, DEFAULT_THEME)
          ? {}
          : { themeConfig: branding.config }),
        ...(branding.logoUrl ? { logoUrl: branding.logoUrl } : {}),
      };
      const initialInventory = Object.entries(selectedVariants)
        .filter(([_, qty]) => qty > 0)
        .map(([variantId, quantity]) => ({ variantId, quantity }));

      const res = await fetch(`${getApiBaseUrl()}/shops/bulk-create`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          ...brandingPayload,
          sourceShopCode: 'FACTORY01',
          initialInventory,
        }),
      });

      if (res.ok) {
        message.success('Shop created and stock cloned successfully');
        onSuccess();
        reset();
      } else {
        const err = await res.json();
        message.error(err.message || 'Failed to create shop');
      }
    } catch (err) {
      message.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    form.resetFields();
    setCurrentStep(STEP_INFO);
    setBranding(DEFAULT_BRANDING);
    setShopName('');
    setSelectedVariants({});
    setSearchQuery('');
    onCancel();
  };

  const columns = [
    {
      title: 'Product',
      dataIndex: 'productName',
      key: 'productName',
    },
    {
      title: 'Variant',
      dataIndex: 'variantName',
      key: 'variantName',
    },
    {
      title: 'Factory Stock',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (q: number) => <span style={{ fontWeight: 500 }}>{q}</span>
    },
    {
      title: 'Add to New Shop',
      key: 'addQty',
      width: 150,
      render: (_: any, record: Variant) => (
        <InputNumber
          min={0}
          max={record.quantity}
          value={selectedVariants[record.id] || 0}
          onChange={(val) => {
            setSelectedVariants(prev => ({
              ...prev,
              [record.id]: val || 0
            }));
          }}
          placeholder="Qty"
        />
      ),
    },
  ];

  const filteredVariants = variants.filter(v => 
    v.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.variantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.barcode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal
      title="Add New Shop"
      open={open}
      onCancel={reset}
      footer={null}
      width={currentStep === STEP_BRANDING ? 920 : 800}
    >
      <Steps
        current={currentStep}
        items={[
          { title: 'Shop Info' },
          { title: 'Branding', content: 'Optional' },
          { title: 'Initial Inventory' },
        ]}
        style={{ marginBottom: 24 }}
      />

      {/* Kept mounted (hidden) so values survive moving between steps */}
      <div hidden={currentStep !== STEP_INFO}>
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Shop Name"
            rules={[{ required: true, message: 'Please enter shop name' }]}
          >
            <Input placeholder="e.g., Salt Lake Counter" />
          </Form.Item>
          
          <Form.Item
            name="currency"
            label="Currency"
            initialValue="INR"
          >
            <Input disabled />
          </Form.Item>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Button type="primary" onClick={handleNext}>
              Next: Branding
            </Button>
          </div>
        </Form>
      </div>
      {currentStep === STEP_BRANDING && (
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            Choose how this shop&apos;s portal looks for its staff. You can skip this and use
            the default Fluxen theme; the shop owner can change it later in
            Settings &rarr; Appearance &amp; branding.
          </p>
          <ThemeConfigurator
            value={branding}
            onChange={setBranding}
            shopName={shopName}
            compact
          />
          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button onClick={() => setCurrentStep(STEP_INFO)}>Back</Button>
            <Space wrap>
              <Button
                onClick={() => {
                  setBranding(DEFAULT_BRANDING);
                  setCurrentStep(STEP_INVENTORY);
                }}
              >
                Skip, use default
              </Button>
              <Button type="primary" onClick={() => setCurrentStep(STEP_INVENTORY)}>
                Next: Select Inventory
              </Button>
            </Space>
          </div>
        </div>
      )}
      {currentStep === STEP_INVENTORY && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: 'var(--bistre-500)', fontSize: '13px', marginBottom: 12 }}>
              Select products from the <b>Factory</b> to stock the new shop. Available stock will be moved to the new shop.
            </p>
            <Input
              placeholder="Search products..."
              prefix={<Search size={16} />}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <Table
            dataSource={filteredVariants}
            columns={columns}
            components={antTableOverflowComponents}
            rowKey="id"
            pagination={{ pageSize: 5 }}
            loading={tableLoading}
            size="small"
            bordered
          />

          <Divider />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button onClick={() => setCurrentStep(STEP_BRANDING)}>Back</Button>
            <Space>
              <span style={{ fontSize: '12px', color: 'var(--bistre-400)' }}>
                {Object.values(selectedVariants).filter(q => q > 0).length} items selected
              </span>
              <Button 
                type="primary" 
                loading={loading}
                onClick={handleCreate}
              >
                Create Shop & Add Inventory
              </Button>
            </Space>
          </div>
        </div>
      )}
    </Modal>
  );
}
