export interface LineItem {
  id: string;
  quantity: number;
  description: string;
  cost: number;
  total: number;
}

export interface InvoiceData {
  date: string;
  invoiceNumber: string;
  deliveryLocation: string;
  vendorName: string;
  vendorEmail: string;
  vendorSignerName?: string;
  receiverSignerName?: string;
  deliveries: LineItem[];
  returns: LineItem[];
}

export interface FormErrors {
  vendorName?: string;
  vendorEmail?: string;
  invoiceNumber?: string;
  date?: string;
}

export interface Vendor {
  name: string;
  email: string;
}

export enum SignatureType {
  VENDOR = 'VENDOR',
  RECEIVER = 'RECEIVER',
}