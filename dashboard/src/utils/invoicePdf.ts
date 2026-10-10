// Invoice PDF for the subscription invoice page, drawn in the browser (no server round trip). jsPDF is
// loaded on demand so it stays out of the main bundle. Values arrive already formatted by the screen, so
// the PDF always shows exactly what the page shows.

export interface InvoicePdfLine {
  label: string;
  value: string;
}

export interface InvoicePdfData {
  id: number;
  issuedOn: string;
  statusLabel: string;
  customer: string;
  itemTitle: string;
  itemDetail: string;
  itemAmount: string;
  /** Promo / coupon / unique code rows between the item and the total. */
  adjustments: InvoicePdfLine[];
  totalLabel: string;
  total: string;
  /** Bank details of KlikUmroh while the invoice still has to be paid; null otherwise. */
  bank: { bank: string; number: string; holder: string } | null;
  uniqueCodeNote: string | null;
}

const MARGIN = 20;
const GRAY = 110;
const LINE = 215;

export async function downloadInvoicePdf(data: InvoicePdfData): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const right = width - MARGIN;
  let y = MARGIN;

  const rule = () => {
    doc.setDrawColor(LINE);
    doc.line(MARGIN, y, right, y);
  };
  const row = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(bold ? 0 : 60);
    doc.text(label, MARGIN, y);
    doc.text(value, right, y, { align: 'right' });
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text('KlikUmroh.id', MARGIN, y + 5);
  doc.setFontSize(22);
  doc.text('INVOICE', right, y + 6, { align: 'right' });
  y += 18;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(GRAY);
  doc.text(`No. invoice`, MARGIN, y);
  doc.text(`Diterbitkan`, MARGIN + 45, y);
  doc.text(`Status`, MARGIN + 90, y);
  y += 5;
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(`#${data.id}`, MARGIN, y);
  doc.text(data.issuedOn, MARGIN + 45, y);
  doc.text(data.statusLabel, MARGIN + 90, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(GRAY);
  doc.text('Ditagihkan kepada', MARGIN, y);
  y += 5;
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(data.customer, MARGIN, y);
  y += 12;

  // Items
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(GRAY);
  doc.text('Deskripsi', MARGIN, y);
  doc.text('Jumlah', right, y, { align: 'right' });
  y += 3;
  rule();
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(data.itemTitle, MARGIN, y);
  doc.text(data.itemAmount, right, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  doc.text(data.itemDetail, MARGIN, y);
  y += 5;
  rule();
  y += 7;

  for (const adj of data.adjustments) {
    row(adj.label, adj.value);
    y += 7;
  }
  doc.setFontSize(12);
  row(data.totalLabel, data.total, true);
  y += 4;
  doc.setDrawColor(LINE);
  rule();
  y += 12;

  // Payment details while the invoice is open
  if (data.bank) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Transfer bank', MARGIN, y);
    y += 7;
    doc.setFontSize(10);
    row('Bank', data.bank.bank);
    y += 6;
    row('Nomor rekening', data.bank.number);
    y += 6;
    row('Atas nama', data.bank.holder);
    y += 8;
    if (data.uniqueCodeNote) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(GRAY);
      const lines = doc.splitTextToSize(data.uniqueCodeNote, right - MARGIN) as string[];
      doc.text(lines, MARGIN, y);
      y += lines.length * 5;
    }
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(GRAY);
  doc.text('Invoice ini dibuat otomatis oleh KlikUmroh.id.', MARGIN, pageHeight - MARGIN);

  doc.save(`Invoice-KlikUmroh-${data.id}.pdf`);
}
