import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, ScanLine, FileCheck, Send, AlertCircle, ChevronDown, ChevronUp, Camera, X, RefreshCw, Database, Link, Download, Search, MapPin } from 'lucide-react';
import { InvoiceData, LineItem, FormErrors, Vendor } from './types';
import { extractInvoiceData } from './services/geminiService';
import { generateInvoicePDF } from './services/pdfService';
import SignaturePad from './components/SignaturePad';

const generateInvoiceNumber = () => {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${dateStr}-${random}`;
};

const initialInvoiceState: InvoiceData = {
  date: new Date().toISOString().split('T')[0],
  invoiceNumber: generateInvoiceNumber(),
  deliveryLocation: 'Viendong',
  vendorName: '',
  vendorEmail: '',
  vendorSignerName: '',
  receiverSignerName: '',
  deliveries: [],
  returns: [],
};

// Helper to convert Column Letter to Index (A -> 0, B -> 1, AA -> 26)
const getColIndex = (col: string) => {
    const clean = col.replace(/[^a-zA-Z]/g, '').toUpperCase();
    let sum = 0;
    for (let i = 0; i < clean.length; i++) {
        sum *= 26;
        sum += (clean.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return sum - 1;
};

const App: React.FC = () => {
  const [formData, setFormData] = useState<InvoiceData>(initialInvoiceState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [vendorSignature, setVendorSignature] = useState<string | null>(null);
  const [receiverSignature, setReceiverSignature] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>('details'); // 'details', 'delivery', 'returns', 'signatures'

  // --- Google Sheets Vendor Integration State ---
  const [vendors, setVendors] = useState<Vendor[]>([]);
  // Defaults based on user provided link
  const [sheetId, setSheetId] = useState('1leRhIc6X9whceYw9p2uIo8rLyL-mnvP-GMXEkREFb9w');
  const [sheetName, setSheetName] = useState('DeliveryApp');
  const [nameCol, setNameCol] = useState('A');
  const [emailCol, setEmailCol] = useState('B');
  
  const [showSheetConfig, setShowSheetConfig] = useState(false);
  const [isFetchingVendors, setIsFetchingVendors] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  
  // --- Handlers for General Inputs ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Auto-fill email if vendor name matches a loaded vendor
    if (name === 'vendorName' && vendors.length > 0) {
        const matchedVendor = vendors.find(v => v.name.toLowerCase() === value.toLowerCase());
        if (matchedVendor) {
            setFormData(prev => ({ ...prev, vendorName: value, vendorEmail: matchedVendor.email }));
        }
    }

    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const regenerateInvoiceNumber = () => {
    setFormData(prev => ({ ...prev, invoiceNumber: generateInvoiceNumber() }));
  };

  // --- Google Sheets Fetch Logic ---
  const fetchVendorsFromSheet = async () => {
    if (!sheetId || !sheetName) {
        setSheetError("Please enter Spreadsheet ID and Sheet Name");
        return;
    }
    setIsFetchingVendors(true);
    setSheetError(null);

    try {
        // Determine column indices
        const nameIdx = getColIndex(nameCol);
        const emailIdx = getColIndex(emailCol);
        
        // Fallback: Try Public CSV Export (Works if sheet is "Anyone with link")
        // We fetch the whole sheet to be safe, then parse columns
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
        
        const csvResponse = await fetch(csvUrl);
        if (!csvResponse.ok) {
            throw new Error("Failed to connect. Ensure the Google Sheet is 'Public' (Anyone with the link) and the Sheet Name is correct.");
        }

        const csvText = await csvResponse.text();
        
        // Robust CSV Parsing (handles commas inside quotes)
        const rows: string[][] = [];
        const lines = csvText.split('\n');
        
        lines.forEach(line => {
            const row: string[] = [];
            let current = '';
            let inQuote = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuote = !inQuote;
                } else if (char === ',' && !inQuote) {
                    row.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            row.push(current.trim());
            rows.push(row);
        });

        const loadedVendors = rows.map(cols => {
            // Remove surrounding quotes if they exist after CSV parse (sometimes artifacts remain)
            const cleanName = cols[nameIdx]?.replace(/^"|"$/g, '').trim();
            const cleanEmail = cols[emailIdx]?.replace(/^"|"$/g, '').trim();
            return {
                name: cleanName || '',
                email: cleanEmail || ''
            };
        }).filter((v, index) => v.name && v.name.toLowerCase() !== 'vendor name' && index > 0); // Filter header approximation

        if (loadedVendors.length === 0) {
            throw new Error("No valid vendors found. Check column letters.");
        }

        setVendors(loadedVendors);
        setShowSheetConfig(false); // Close config on success
        // Optional: alert(`Synced ${loadedVendors.length} vendors from sheet.`);

    } catch (err: any) {
        console.error(err);
        setSheetError(err.message || "Failed to fetch data.");
    } finally {
        setIsFetchingVendors(false);
    }
  };

  // --- Handlers for Line Items ---
  const addLineItem = (type: 'deliveries' | 'returns') => {
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      quantity: 1,
      description: '',
      cost: 0,
      total: 0
    };
    setFormData(prev => ({
      ...prev,
      [type]: [...prev[type], newItem]
    }));
  };

  const removeLineItem = (type: 'deliveries' | 'returns', id: string) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].filter(item => item.id !== id)
    }));
  };

  const updateLineItem = (type: 'deliveries' | 'returns', id: string, field: keyof LineItem, value: string | number) => {
    setFormData(prev => {
      const updatedItems = prev[type].map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          // Recalculate total if qty or cost changes
          if (field === 'quantity' || field === 'cost') {
            const qty = field === 'quantity' ? Number(value) : item.quantity;
            const cost = field === 'cost' ? Number(value) : item.cost;
            updatedItem.total = qty * cost;
          }
          return updatedItem;
        }
        return item;
      });
      return { ...prev, [type]: updatedItems };
    });
  };

  // --- OCR / Camera Handler ---
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingOCR(true);
    setOcrError(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      // Remove data:image/jpeg;base64, prefix
      const base64Data = base64String.split(',')[1];

      try {
        const extractedData = await extractInvoiceData(base64Data);
        setFormData(prev => ({
          ...prev,
          ...extractedData,
          // Preserve generated invoice number if OCR doesn't find one
          invoiceNumber: extractedData.invoiceNumber || prev.invoiceNumber,
          // Merge extracted items with existing if needed, currently overwrites deliveries
          deliveries: extractedData.deliveries?.length ? extractedData.deliveries : prev.deliveries
        }));
        setActiveSection('details'); // Expand details to show result
      } catch (err) {
        setOcrError("Failed to extract data. Please try again or fill manually.");
      } finally {
        setIsProcessingOCR(false);
        // Clear input value to allow re-selecting same file
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // --- Validation & Submit ---
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.vendorName.trim()) newErrors.vendorName = "Vendor name is required";
    if (!formData.invoiceNumber.trim()) newErrors.invoiceNumber = "Invoice number is required";
    
    // Simple email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.vendorEmail && !emailRegex.test(formData.vendorEmail)) {
        newErrors.vendorEmail = "Invalid email format";
    } else if (!formData.vendorEmail) {
        newErrors.vendorEmail = "Vendor email is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) {
      alert("Please fix errors before submitting.");
      return;
    }
    if (!vendorSignature || !receiverSignature) {
      alert("Both signatures are required.");
      setActiveSection('signatures');
      return;
    }

    try {
        generateInvoicePDF(formData, vendorSignature, receiverSignature);
        alert(`Form submitted! Sending email to ${formData.vendorEmail}... (Simulated)`);
    } catch (e) {
        console.error(e);
        alert("Error generating PDF. Please try again.");
    }
  };

  const toggleSection = (section: string) => {
      setActiveSection(activeSection === section ? null : section);
  }

  // --- Render Helper for Line Item Row ---
  const renderLineItemRow = (item: LineItem, type: 'deliveries' | 'returns') => (
    <div key={item.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-2 animate-fade-in">
      <div className="grid grid-cols-12 gap-2 items-center">
        <div className="col-span-12 sm:col-span-6">
          <label className="block text-xs text-slate-500 mb-1">Description</label>
          <input
            type="text"
            value={item.description}
            onChange={(e) => updateLineItem(type, item.id, 'description', e.target.value)}
            className="w-full p-2 text-sm border rounded bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Item Name"
          />
        </div>
        <div className="col-span-4 sm:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Qty</label>
          <input
            type="number"
            value={item.quantity}
            onChange={(e) => updateLineItem(type, item.id, 'quantity', Number(e.target.value))}
            className="w-full p-2 text-sm border rounded bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="col-span-4 sm:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Cost</label>
          <input
            type="number"
            value={item.cost}
            onChange={(e) => updateLineItem(type, item.id, 'cost', Number(e.target.value))}
            className="w-full p-2 text-sm border rounded bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
         <div className="col-span-3 sm:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Total</label>
          <div className="w-full p-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded">
             ${item.total.toFixed(2)}
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
           <button 
              onClick={() => removeLineItem(type, item.id)}
              className="text-red-500 text-xs flex items-center hover:text-red-700 transition-colors p-1"
           >
               <Trash2 size={14} className="mr-1"/> Remove Item
           </button>
      </div>
    </div>
  );

  // --- Calculations ---
  const calculateSectionTotal = (items: LineItem[]) => items.reduce((acc, curr) => acc + curr.total, 0);
  
  const deliveryTotal = calculateSectionTotal(formData.deliveries);
  const returnsTotal = calculateSectionTotal(formData.returns);
  const netTotal = deliveryTotal - returnsTotal;

  return (
    <div className="min-h-screen bg-slate-100 pb-20 font-sans">
      {/* Top Bar */}
      <div className="bg-blue-900 text-white p-4 shadow-md sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <FileCheck size={20} /> SmartInvoice
          </h1>
          <div className="relative">
            <input
                type="file"
                id="ocr-upload"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                capture="environment"
            />
            <label 
                htmlFor="ocr-upload" 
                className={`flex items-center gap-1 bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${isProcessingOCR ? 'opacity-50 pointer-events-none' : ''}`}
            >
                {isProcessingOCR ? (
                   <span className="animate-pulse flex items-center gap-1">Scanning...</span>
                ) : (
                    <>
                        <ScanLine size={16} /> Scan Invoice
                    </>
                )}
            </label>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {ocrError && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-200">
                <AlertCircle size={16}/> {ocrError}
                <button onClick={() => setOcrError(null)} className="ml-auto"><X size={16}/></button>
            </div>
        )}

        {/* Section 1: Invoice Info */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button 
                onClick={() => toggleSection('details')}
                className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-100"
            >
                <span className="font-semibold text-slate-700">General</span>
                {activeSection === 'details' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            
            {activeSection === 'details' && (
                <div className="p-4 space-y-4">
                    {/* Vendor Sheet Connection Toggle */}
                    <div className="flex justify-between items-center bg-blue-50 p-2 rounded-lg border border-blue-100">
                         <div className="flex items-center gap-2 text-blue-800 text-xs font-medium">
                            <Database size={14} />
                            {vendors.length > 0 ? `${vendors.length} Vendors Loaded` : 'Connect to Google Sheets'}
                         </div>
                        <button 
                            onClick={() => setShowSheetConfig(!showSheetConfig)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                            {showSheetConfig ? 'Hide Settings' : 'Configure'}
                        </button>
                    </div>

                    {/* Sheet Configuration Panel */}
                    {showSheetConfig && (
                        <div className="bg-white border border-blue-200 rounded-lg p-4 animate-fade-in shadow-inner">
                             <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1">
                                <Link size={12}/> Sheet Settings
                             </h4>
                             <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Spreadsheet ID</label>
                                    <input 
                                        type="text" 
                                        value={sheetId}
                                        onChange={(e) => setSheetId(e.target.value)}
                                        className="w-full p-2 text-xs border border-slate-300 rounded bg-slate-50 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-1">
                                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Sheet Name</label>
                                        <input 
                                            type="text" 
                                            value={sheetName}
                                            onChange={(e) => setSheetName(e.target.value)}
                                            className="w-full p-2 text-xs border border-slate-300 rounded bg-slate-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Name Col</label>
                                        <input 
                                            type="text" 
                                            value={nameCol}
                                            onChange={(e) => setNameCol(e.target.value)}
                                            placeholder="A"
                                            className="w-full p-2 text-xs border border-slate-300 rounded bg-slate-50 text-center uppercase"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Email Col</label>
                                        <input 
                                            type="text" 
                                            value={emailCol}
                                            onChange={(e) => setEmailCol(e.target.value)}
                                            placeholder="B"
                                            className="w-full p-2 text-xs border border-slate-300 rounded bg-slate-50 text-center uppercase"
                                        />
                                    </div>
                                </div>
                                <button 
                                    onClick={fetchVendorsFromSheet}
                                    disabled={isFetchingVendors}
                                    className="w-full bg-blue-600 text-white text-xs px-3 py-2.5 rounded shadow-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-semibold"
                                >
                                    {isFetchingVendors ? <RefreshCw size={14} className="animate-spin"/> : <Download size={14}/>}
                                    {isFetchingVendors ? 'Syncing...' : 'Sync Vendors'}
                                </button>
                                {sheetError && <p className="text-xs text-red-500 mt-1">{sheetError}</p>}
                             </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                            <input
                                type="date"
                                name="date"
                                value={formData.date}
                                onChange={handleInputChange}
                                className={`w-full p-2.5 bg-slate-50 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${errors.date ? 'border-red-500' : 'border-slate-200'}`}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Invoice #</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    name="invoiceNumber"
                                    value={formData.invoiceNumber}
                                    onChange={handleInputChange}
                                    placeholder="INV-001"
                                    className={`flex-1 p-2.5 bg-slate-50 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${errors.invoiceNumber ? 'border-red-500' : 'border-slate-200'}`}
                                />
                                <button
                                    type="button"
                                    onClick={regenerateInvoiceNumber}
                                    className="p-2 text-slate-500 hover:text-blue-600 border border-slate-200 rounded-lg bg-slate-50"
                                    title="Generate new Invoice Number"
                                >
                                    <RefreshCw size={18} />
                                </button>
                            </div>
                             {errors.invoiceNumber && <span className="text-xs text-red-500">{errors.invoiceNumber}</span>}
                        </div>
                    </div>
                    
                    {/* Vendor Inputs with Datalist */}
                    <div>
                         <label className="block text-xs font-medium text-slate-500 mb-1 flex justify-between">
                             Vendor Name
                             {vendors.length > 0 && <span className="text-[10px] text-green-600 font-normal">Connected to Sheet</span>}
                         </label>
                         <div className="relative">
                            <input
                                type="text"
                                name="vendorName"
                                list="vendor-list"
                                value={formData.vendorName}
                                onChange={handleInputChange}
                                autoComplete="off"
                                placeholder={vendors.length > 0 ? "Select vendor..." : "Company LLC"}
                                className={`w-full p-2.5 bg-slate-50 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none pr-10 ${errors.vendorName ? 'border-red-500' : 'border-slate-200'}`}
                            />
                            <datalist id="vendor-list">
                                {vendors.map((v, idx) => (
                                    <option key={idx} value={v.name} />
                                ))}
                            </datalist>
                            
                            <div className="absolute right-1 top-1 bottom-1 flex items-center">
                                {vendors.length > 0 && (
                                    <button 
                                        onClick={fetchVendorsFromSheet}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors mr-1"
                                        title="Refresh List"
                                    >
                                        <RefreshCw size={14} className={isFetchingVendors ? "animate-spin" : ""} />
                                    </button>
                                )}
                                <div className="pointer-events-none p-1.5 text-slate-400">
                                   <ChevronDown size={16} />
                                </div>
                            </div>
                         </div>
                        {errors.vendorName && <span className="text-xs text-red-500">{errors.vendorName}</span>}
                    </div>
                    <div>
                         <label className="block text-xs font-medium text-slate-500 mb-1">Vendor Email</label>
                         <input
                            type="email"
                            name="vendorEmail"
                            value={formData.vendorEmail}
                            onChange={handleInputChange}
                            placeholder="billing@company.com"
                            className={`w-full p-2.5 bg-slate-50 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${errors.vendorEmail ? 'border-red-500' : 'border-slate-200'}`}
                        />
                         {errors.vendorEmail && <span className="text-xs text-red-500">{errors.vendorEmail}</span>}
                    </div>
                    
                    {/* Delivery Location Selection */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Delivery Location</label>
                        <div className="relative">
                            <select
                                name="deliveryLocation"
                                value={formData.deliveryLocation}
                                onChange={handleInputChange}
                                className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none border-slate-200 appearance-none"
                            >
                                <option value="Viendong">Viendong</option>
                                <option value="Worldfoods">Worldfoods</option>
                            </select>
                            <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
                                <MapPin size={16} />
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>

        {/* Section 2: Delivery Details */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
             <button 
                onClick={() => toggleSection('delivery')}
                className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-100"
            >
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">Delivery</span>
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">{formData.deliveries.length}</span>
                </div>
                {activeSection === 'delivery' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {activeSection === 'delivery' && (
                <div className="p-4 bg-slate-50/50">
                    {formData.deliveries.map(item => renderLineItemRow(item, 'deliveries'))}
                    
                    {formData.deliveries.length === 0 && (
                        <div className="text-center py-6 text-slate-400 text-sm">
                            No items added yet.
                        </div>
                    )}

                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-200">
                         <div className="text-sm font-semibold text-slate-700">
                            Subtotal: <span className="text-blue-600">${deliveryTotal.toFixed(2)}</span>
                         </div>
                         <button
                            onClick={() => addLineItem('deliveries')}
                            className="flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-blue-700 transition-colors"
                         >
                            <Plus size={16}/> Add Item
                         </button>
                    </div>
                </div>
            )}
        </div>

        {/* Section 3: Returns Details */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
             <button 
                onClick={() => toggleSection('returns')}
                className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-100"
            >
                <div className="flex items-center gap-2">
                     <span className="font-semibold text-slate-700">Returns</span>
                     {formData.returns.length > 0 && (
                         <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-bold">{formData.returns.length}</span>
                     )}
                </div>
                {activeSection === 'returns' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {activeSection === 'returns' && (
                <div className="p-4 bg-slate-50/50">
                    {formData.returns.map(item => renderLineItemRow(item, 'returns'))}
                     {formData.returns.length === 0 && (
                        <div className="text-center py-6 text-slate-400 text-sm">
                            No returns.
                        </div>
                    )}
                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-200">
                        <div className="text-sm font-semibold text-slate-700">
                            Subtotal: <span className="text-red-600">${returnsTotal.toFixed(2)}</span>
                         </div>
                         <button
                            onClick={() => addLineItem('returns')}
                            className="flex items-center gap-1 bg-slate-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-slate-700 transition-colors"
                         >
                            <Plus size={16}/> Add Return
                         </button>
                    </div>
                </div>
            )}
        </div>

        {/* Section: Summary */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden p-4 border-t-4 border-slate-600">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                Payment Summary
            </h3>
            <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-600 border-b border-slate-100 pb-2">
                    <span>Delivery Subtotal</span>
                    <span className="font-medium text-slate-900">${deliveryTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 border-b border-slate-100 pb-2">
                    <span>Returns Subtotal</span>
                    <span className="font-medium text-red-600">-${returnsTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                    <span className="font-bold text-lg text-slate-900">Net Total</span>
                    <span className="font-bold text-xl text-slate-900 underline decoration-blue-500 decoration-2 underline-offset-4">
                        ${netTotal.toFixed(2)}
                    </span>
                </div>
            </div>
        </div>

        {/* Section 4: Signatures */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button 
                onClick={() => toggleSection('signatures')}
                className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-100"
            >
                <span className="font-semibold text-slate-700">Signatures</span>
                {activeSection === 'signatures' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            
            {activeSection === 'signatures' && (
                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-slate-500">Vendor Name</label>
                         <input
                            type="text"
                            name="vendorSignerName"
                            value={formData.vendorSignerName}
                            onChange={handleInputChange}
                            className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none border-slate-200"
                            placeholder="Print Name"
                        />
                        <SignaturePad label="Vendor Signature" onEnd={setVendorSignature} />
                    </div>
                     <div className="space-y-2 pt-2">
                        <label className="block text-xs font-medium text-slate-500">Receiver Name</label>
                        <input
                            type="text"
                            name="receiverSignerName"
                            value={formData.receiverSignerName}
                            onChange={handleInputChange}
                            className="w-full p-2.5 bg-slate-50 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none border-slate-200"
                            placeholder="Print Name"
                        />
                        <SignaturePad label="Receiver Signature" onEnd={setReceiverSignature} />
                    </div>
                </div>
            )}
        </div>
        
        {/* Submit Action */}
        <div className="fixed bottom-4 left-0 right-0 px-4 z-10 flex justify-center">
            <button
                onClick={handleSubmit}
                className="w-full max-w-md bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transform active:scale-[0.98] transition-all"
            >
                <Send size={20} /> Submit & Send Invoice
            </button>
        </div>
      </div>
    </div>
  );
};

export default App;