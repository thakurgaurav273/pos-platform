import { Modal, Button, App } from 'antd';
import { Printer } from 'lucide-react';
import { BarcodeLabel } from './BarcodeLabel';
import { openPrintableBarcodes } from '@/lib/printBarcodes';

export interface BarcodePrintItem {
  id: string;
  productName: string;
  variantName?: string;
  barcode: string;
  price: number;
}

interface BarcodePrintModalProps {
  open: boolean;
  onCancel: () => void;
  items: BarcodePrintItem[];
}

/**
 * Modal to preview and print barcode labels.
 * Delegate actual printing to openPrintableBarcodes for reliability.
 */
export function BarcodePrintModal({
  open,
  onCancel,
  items,
}: BarcodePrintModalProps) {
  const { message } = App.useApp();

  const handlePrint = () => {
    const ok = openPrintableBarcodes(items);
    if (!ok) {
      message.error('The print window was blocked. Please allow pop-ups for this site.');
    } else {
      onCancel(); // Close modal after initiating print
    }
  };

  const isBulk = items.length > 1;

  return (
    <Modal
      title={isBulk ? `Print Barcodes (${items.length} items)` : 'Print Barcode Label'}
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<Printer className="h-4 w-4" />}
          onClick={handlePrint}
          style={{ backgroundColor: 'var(--ochre-600)', borderColor: 'var(--ochre-600)' }}
          disabled={items.length === 0}
        >
          Print Now
        </Button>,
      ]}
      width={isBulk ? 800 : 450}
      centered
      className="barcode-print-modal"
    >
      <div className="print-preview-content">
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          {isBulk
            ? 'The preview below shows the selected items. Click "Print Now" to open the formatted printer view.'
            : 'Check the preview below. Click "Print Now" to send to your label printer.'}
        </p>

        {/* On-screen Preview Grid */}
        <div 
          className="preview-grid"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            justifyContent: 'center',
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '16px',
            background: 'var(--linen)',
            borderRadius: 'var(--ui-radius-lg)',
            border: '1px solid var(--border)'
          }}
        >
          {items.length === 0 ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)' }}>No items selected to print.</div>
          ) : (
            items.map((item) => (
              <div 
                key={item.id} 
                style={{ 
                  boxShadow: 'var(--shadow-md)', 
                  background: 'white',
                  borderRadius: '2px' 
                }}
              >
                <BarcodeLabel
                  productName={item.productName}
                  variantName={item.variantName}
                  price={item.price}
                  barcode={item.barcode}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
