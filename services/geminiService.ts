import { GoogleGenAI, Type } from "@google/genai";
import { InvoiceData, LineItem } from "../types";

const MODEL_NAME = "gemini-2.5-flash";

// Define the schema for the invoice extraction
const invoiceSchema = {
  type: Type.OBJECT,
  properties: {
    invoiceNumber: { type: Type.STRING, description: "The invoice or delivery note number" },
    date: { type: Type.STRING, description: "The date of the invoice in YYYY-MM-DD format" },
    vendorName: { type: Type.STRING, description: "The name of the vendor or supplier" },
    vendorEmail: { type: Type.STRING, description: "Email address of the vendor if available" },
    deliveries: {
      type: Type.ARRAY,
      description: "List of items being delivered or invoiced",
      items: {
        type: Type.OBJECT,
        properties: {
          quantity: { type: Type.NUMBER },
          description: { type: Type.STRING },
          cost: { type: Type.NUMBER, description: "Unit cost of the item" },
        },
        required: ["quantity", "description", "cost"],
      },
    },
  },
  required: ["invoiceNumber", "date", "vendorName", "deliveries"],
};

export const extractInvoiceData = async (base64Image: string): Promise<Partial<InvoiceData>> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
            {
                inlineData: {
                    mimeType: "image/jpeg",
                    data: base64Image
                }
            },
            {
                text: "Extract the invoice details from this image. If specific fields like email are missing, leave them empty. Identify line items. Ensure costs are numeric."
            }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: invoiceSchema,
        systemInstruction: "You are an expert OCR data extraction assistant specialized in invoices and delivery notes.",
      },
    });

    const text = response.text;
    if (!text) throw new Error("No data returned from Gemini");

    const rawData = JSON.parse(text);

    // Map the raw response to our internal structure, adding IDs and calculating totals
    const deliveries: LineItem[] = (rawData.deliveries || []).map((item: any) => ({
      id: crypto.randomUUID(),
      quantity: Number(item.quantity) || 0,
      description: item.description || "",
      cost: Number(item.cost) || 0,
      total: (Number(item.quantity) || 0) * (Number(item.cost) || 0),
    }));

    return {
      invoiceNumber: rawData.invoiceNumber || "",
      date: rawData.date || new Date().toISOString().split('T')[0],
      vendorName: rawData.vendorName || "",
      vendorEmail: rawData.vendorEmail || "",
      deliveries: deliveries,
      returns: [], // Usually not on the initial invoice, so we default to empty
    };

  } catch (error) {
    console.error("OCR Extraction Error:", error);
    throw error;
  }
};