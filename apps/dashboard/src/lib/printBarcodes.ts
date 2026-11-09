import JsBarcode from 'jsbarcode';

export type BarcodePrintData = {
  productName: string;
  variantName?: string;
  barcode: string;
  price: number;
};

export function openPrintableBarcodes(items: BarcodePrintData[]): boolean {
  if (typeof window === 'undefined') return true;
  if (items.length === 0) return true;

  const labelsHtml = items.map((item) => {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode(svgEl, item.barcode, {
        width: 1.2,
        height: 35,
        fontSize: 10,
        margin: 0,
        displayValue: true,
      });
    } catch (e) {
      console.error(`Barcode generation failed for ${item.barcode}`, e);
    }

    const svgString = new XMLSerializer().serializeToString(svgEl);
    const title = [item.productName, item.variantName]
      .filter(Boolean)
      .join(' · ');

    return `
      <div class="label-page">
        <div class="label-container">
          <div class="title">${title}</div>
          <div class="barcode">${svgString}</div>
        </div>
      </div>
    `;
  }).join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Labels - Fluxen POS</title>
  <style>
    * { 
      box-sizing: border-box; 
      -webkit-print-color-adjust: exact;
    }
    body {
      margin: 0;
      padding: 0;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    
    /* Label item in the grid */
    .label-page {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1mm;
    }

    .label-container {
      width: 50mm;
      height: 25mm;
      padding: 2mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      overflow: hidden;
      background: white;
      border: 0.1px solid rgba(0,0,0,0.05); /* Very faint border to help alignment if needed */
    }

    .title {
      font-size: 9pt;
      font-weight: 700;
      line-height: 1.2;
      max-height: 2.4em;
      overflow: hidden;
      margin-bottom: 1.5mm;
      color: black;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
    }

    .barcode {
      width: 100%;
      height: auto;
      display: flex;
      justify-content: center;
      margin-top: 1mm;
    }
    
    .barcode svg {
      max-width: 100%;
      height: auto;
    }

    @page {
      margin: 10mm;
      size: auto;
    }

    @media print {
      body {
        width: 100%;
        gap: 5mm;
      }
      .label-page {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${labelsHtml}
  <script>
    window.onload = function() {
      // Small delay to ensure rendering matches dialog appearing
      setTimeout(function() {
        window.focus();
        window.print();
      }, 250);
    };
  </script>
</body>
</html>
  `;

  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, '_blank');

    if (!win) {
      URL.revokeObjectURL(blobUrl);
      return false;
    }

    const cleanup = () => {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    };

    if (win.document.readyState === 'complete') {
      cleanup();
    } else {
      win.addEventListener('load', cleanup, { once: true });
    }

    return true;
  } catch (err) {
    console.error('Failed to open print window', err);
    return false;
  }
}
