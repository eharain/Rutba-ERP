import { BASE_URL } from "../static/const";
import axios from "axios";

export interface CreateLeadRequest {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  notes?: string;
}

export interface LeadResponse {
  id: number;
  documentId: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  status: string;
}

export async function createLead(data: CreateLeadRequest): Promise<LeadResponse> {
  try {
    const response = await axios.post(`${BASE_URL}crm-leads`, {
      data: {
        ...data,
        source: data.source || "Website",
        status: "New",
      },
    });
    return response.data?.data ?? response.data;
  } catch (error: any) {
    if (error?.response?.data?.error) {
      throw error.response.data.error.message;
    }
    throw error;
  }
}
