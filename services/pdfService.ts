import { InvoiceData } from "../types";

// We assume jsPDF is loaded via CDN in index.html globally
declare global {
  interface Window {
    jspdf: any;
  }
}

export const generateInvoicePDF = (
  data: InvoiceData,
  vendorSignatureData: string | null,
  receiverSignatureData: string | null
) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header Text (Title)
  doc.setFontSize(22);
  doc.setTextColor(40);
  doc.text("DELIVERY INVOICE", 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

  // Divider Line
  doc.setDrawColor(200);
  doc.line(14, 35, 196, 35);
  
  let finalY = 45;

  // Section 1: Details
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text("Vendor", 14, finalY);
  
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(`Vendor: ${data.vendorName}`, 14, finalY + 7);
  doc.text(`Email: ${data.vendorEmail}`, 14, finalY + 13);
  doc.text(`Delivery Location: ${data.deliveryLocation}`, 14, finalY + 19);
  
  doc.text(`Invoice #: ${data.invoiceNumber}`, 120, finalY + 7);
  doc.text(`Date: ${data.date}`, 120, finalY + 13);

  finalY += 30;

  // Prepare Table Data Helpers
  const tableHeaders = [["Qty", "Description", "Unit Cost", "Total"]];
  const formatCurrency = (num: number) => `$${num.toFixed(2)}`;

  // Section 2: Deliveries
  const deliveryRows = data.deliveries.map(item => [
    item.quantity,
    item.description,
    formatCurrency(item.cost),
    formatCurrency(item.total)
  ]);

  // Delivery Header
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text("Delivery", 14, finalY);
  finalY += 6;

  // @ts-ignore - autotable is added via CDN
  doc.autoTable({
    startY: finalY,
    head: tableHeaders,
    body: deliveryRows,
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246] }, // Blue-500
  });

  // @ts-ignore
  finalY = doc.lastAutoTable.finalY + 15;

  // Section 3: Returns
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text("Returns", 14, finalY);
  finalY += 6;

  if (data.returns.length > 0) {
     const returnRows = data.returns.map(item => [
      item.quantity,
      item.description,
      formatCurrency(item.cost),
      formatCurrency(item.total)
    ]);

    // @ts-ignore
    doc.autoTable({
      startY: finalY,
      head: tableHeaders,
      body: returnRows,
      theme: 'striped',
      headStyles: { fillColor: [239, 68, 68] }, // Red-500
    });
    // @ts-ignore
    finalY = doc.lastAutoTable.finalY + 10;
  } else {
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text("No returns recorded for this invoice.", 14, finalY);
      finalY += 10;
  }

  // --- Summary Section ---
  const deliveryTotal = data.deliveries.reduce((sum, item) => sum + item.total, 0);
  const returnsTotal = data.returns.reduce((sum, item) => sum + item.total, 0);
  const netTotal = deliveryTotal - returnsTotal;

  // Check if we have enough space for summary, if not add page
  if (finalY > 240) {
      doc.addPage();
      finalY = 20;
  }

  // Draw a small box or line for summary
  const summaryStartX = 120;
  doc.setDrawColor(200);
  doc.line(summaryStartX, finalY, 196, finalY);
  finalY += 8;

  doc.setFontSize(10);
  doc.setTextColor(0);
  
  // Delivery Subtotal
  doc.text("Delivery Subtotal:", summaryStartX, finalY);
  doc.text(`$${deliveryTotal.toFixed(2)}`, 196, finalY, { align: "right" });
  finalY += 6;

  // Returns Subtotal
  doc.text("Returns Subtotal:", summaryStartX, finalY);
  doc.setTextColor(220, 50, 50); // Redish
  doc.text(`-$${returnsTotal.toFixed(2)}`, 196, finalY, { align: "right" });
  finalY += 2;

  doc.setDrawColor(200);
  doc.line(summaryStartX, finalY + 2, 196, finalY + 2);
  finalY += 8;

  // Net Total
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0);
  doc.text("Net Total:", summaryStartX, finalY);
  doc.text(`$${netTotal.toFixed(2)}`, 196, finalY, { align: "right" });
  doc.setFont(undefined, 'normal');

  finalY += 15;

  // Section 4: Signatures
  
  // Check if we need a new page for signatures
  if (finalY > 250) {
      doc.addPage();
      finalY = 20;
  }

  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text("Signatures", 14, finalY);
  finalY += 10;

  const sigWidth = 60;
  const sigHeight = 30;

  if (vendorSignatureData) {
    doc.addImage(vendorSignatureData, 'PNG', 14, finalY, sigWidth, sigHeight);
    doc.setFontSize(8);
    doc.text("Vendor Signature", 14, finalY + sigHeight + 5);
    if (data.vendorSignerName) {
        doc.text(`Signed by: ${data.vendorSignerName}`, 14, finalY + sigHeight + 10);
    }
  }

  if (receiverSignatureData) {
    doc.addImage(receiverSignatureData, 'PNG', 100, finalY, sigWidth, sigHeight);
    doc.setFontSize(8);
    doc.text("Receiver Signature", 100, finalY + sigHeight + 5);
    if (data.receiverSignerName) {
        doc.text(`Signed by: ${data.receiverSignerName}`, 100, finalY + sigHeight + 10);
    }
  }

  // Save
  doc.save(`invoice_${data.invoiceNumber || 'draft'}.pdf`);
};