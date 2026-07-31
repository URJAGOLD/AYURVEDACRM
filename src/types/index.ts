export interface AuthUser {
  id: number; name: string; email: string;
  role: "SUPER_ADMIN" | "MANAGER" | "AGENT" | "VIEWER";
  permissions: Record<string, boolean>; mustChangePw?: boolean;
}
export interface Order {
  id: number; orderCode: string; dateTime: string; customerName: string; contactNumber: string;
  email?: string | null; productName: string; quantity: number; price: string | number;
  address: string; city: string; stateId?: number | null; districtId?: number | null; pincode: string;
  orderStatus: string; paymentStatus: string; source: string; remark?: string | null; followUpDate?: string | null;
  leadOwnerId?: number | null; dealerId?: number | null; sourceTags?: any; altMobile?: string | null; totalAmount?: string | number | null; onlinePaid?: string | number | null; paymentMode?: string | null;
  awbCode?: string | null; courierName?: string | null; shippingStatus?: string | null; labelUrl?: string | null;
  state?: { name: string } | null; district?: { name: string } | null;
  dealer?: { id: number; name: string } | null; leadOwner?: { id: number; name: string } | null;
  zoneManager?: { name: string } | null; zmId?: number | null; agentAssignDate?: string | null; dealerAssignDate?: string | null;
}
export interface UserRow {
  id: number; name: string; email: string; phone?: string | null;
  role: AuthUser["role"]; permissions: Record<string, boolean>;
  isActive: boolean; lastLoginAt?: string | null; createdAt: string;
}