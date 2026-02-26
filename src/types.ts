// ============================================================================
// Auth
// ============================================================================

export interface TokenResponse {
  tokenType: string;
  refreshExpiresIn: number;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  scope: string;
  notBeforePolicy: string;
  sessionState: string;
}

// ============================================================================
// Common nested types
// ============================================================================

export interface Address {
  city?: string;
  district?: string;
  street?: string;
  building?: string;
  address?: string;
  zipcode?: string;
  longitude?: string;
  latitude?: string;
}

export interface SenderBranchData {
  register?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: Address;
}

export interface SenderStaffData {
  name?: string;
  email?: string;
  phone?: string;
}

export interface InvoiceReceiverData {
  register?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: Address;
}

export interface Account {
  accountBankCode: string;
  accountNumber: string;
  ibanNumber: string;
  accountName: string;
  accountCurrency: string;
  isDefault: boolean;
}

export interface Transaction {
  description: string;
  amount: string;
  accounts?: Account[];
}

export interface InvoiceLine {
  taxProductCode?: string;
  lineDescription: string;
  lineQuantity: string;
  lineUnitPrice: string;
  note?: string;
  discounts?: TaxEntry[];
  surcharges?: TaxEntry[];
  taxes?: TaxEntry[];
}

export interface EbarimtInvoiceLine {
  taxProductCode?: string;
  lineDescription: string;
  barcode?: string;
  lineQuantity: string;
  lineUnitPrice: string;
  note?: string;
  classificationCode?: string;
  taxes?: TaxEntry[];
}

export interface TaxEntry {
  taxCode?: string;
  discountCode?: string;
  surchargeCode?: string;
  description: string;
  amount: number;
  note?: string;
}

export interface Deeplink {
  name: string;
  description: string;
  logo: string;
  link: string;
}

// ============================================================================
// Invoice
// ============================================================================

export interface CreateInvoiceRequest {
  invoiceCode: string;
  senderInvoiceNo: string;
  senderBranchCode?: string;
  senderBranchData?: SenderBranchData;
  senderStaffData?: SenderStaffData;
  senderStaffCode?: string;
  invoiceReceiverCode: string;
  invoiceReceiverData?: InvoiceReceiverData;
  invoiceDescription: string;
  enableExpiry?: string;
  allowPartial?: boolean;
  minimumAmount?: number;
  allowExceed?: boolean;
  maximumAmount?: number;
  amount: number;
  callbackUrl: string;
  senderTerminalCode?: string;
  senderTerminalData?: unknown;
  allowSubscribe?: boolean;
  subscriptionInterval?: string;
  subscriptionWebhook?: string;
  note?: string;
  transactions?: Transaction[];
  lines?: InvoiceLine[];
}

export interface CreateSimpleInvoiceRequest {
  invoiceCode: string;
  senderInvoiceNo: string;
  invoiceReceiverCode: string;
  invoiceDescription: string;
  senderBranchCode?: string;
  amount: number;
  callbackUrl: string;
}

export interface CreateEbarimtInvoiceRequest {
  invoiceCode: string;
  senderInvoiceNo: string;
  senderBranchCode?: string;
  senderStaffData?: SenderStaffData;
  senderStaffCode?: string;
  invoiceReceiverCode: string;
  invoiceReceiverData?: InvoiceReceiverData;
  invoiceDescription: string;
  taxType: string;
  districtCode: string;
  callbackUrl: string;
  lines: EbarimtInvoiceLine[];
}

export interface InvoiceResponse {
  invoiceId: string;
  qrText: string;
  qrImage: string;
  qPayShortUrl: string;
  urls: Deeplink[];
}

// ============================================================================
// Payment
// ============================================================================

export interface Offset {
  pageNumber: number;
  pageLimit: number;
}

export interface PaymentCheckRequest {
  objectType: string;
  objectId: string;
  offset?: Offset;
}

export interface PaymentCheckResponse {
  count: number;
  paidAmount?: number;
  rows: PaymentCheckRow[];
}

export interface PaymentCheckRow {
  paymentId: string;
  paymentStatus: string;
  paymentAmount: string;
  trxFee: string;
  paymentCurrency: string;
  paymentWallet: string;
  paymentType: string;
  nextPaymentDate?: string;
  nextPaymentDatetime?: string;
  cardTransactions: CardTransaction[];
  p2pTransactions: P2PTransaction[];
}

export interface PaymentDetail {
  paymentId: string;
  paymentStatus: string;
  paymentFee: string;
  paymentAmount: string;
  paymentCurrency: string;
  paymentDate: string;
  paymentWallet: string;
  transactionType: string;
  objectType: string;
  objectId: string;
  nextPaymentDate?: string;
  nextPaymentDatetime?: string;
  cardTransactions: CardTransaction[];
  p2pTransactions: P2PTransaction[];
}

export interface CardTransaction {
  cardMerchantCode?: string;
  cardTerminalCode?: string;
  cardNumber?: string;
  cardType: string;
  isCrossBorder: boolean;
  amount?: string;
  transactionAmount?: string;
  currency?: string;
  transactionCurrency?: string;
  date?: string;
  transactionDate?: string;
  status?: string;
  transactionStatus?: string;
  settlementStatus: string;
  settlementStatusDate: string;
}

export interface P2PTransaction {
  transactionBankCode: string;
  accountBankCode: string;
  accountBankName: string;
  accountNumber: string;
  status: string;
  amount: string;
  currency: string;
  settlementStatus: string;
}

export interface PaymentListRequest {
  objectType: string;
  objectId: string;
  startDate: string;
  endDate: string;
  offset: Offset;
}

export interface PaymentListResponse {
  count: number;
  rows: PaymentListItem[];
}

export interface PaymentListItem {
  paymentId: string;
  paymentDate: string;
  paymentStatus: string;
  paymentFee: string;
  paymentAmount: string;
  paymentCurrency: string;
  paymentWallet: string;
  paymentName: string;
  paymentDescription: string;
  qrCode: string;
  paidBy: string;
  objectType: string;
  objectId: string;
}

export interface PaymentCancelRequest {
  callbackUrl?: string;
  note?: string;
}

export interface PaymentRefundRequest {
  callbackUrl?: string;
  note?: string;
}

// ============================================================================
// Ebarimt
// ============================================================================

export interface CreateEbarimtRequest {
  paymentId: string;
  ebarimtReceiverType: string;
  ebarimtReceiver?: string;
  districtCode?: string;
  classificationCode?: string;
}

export interface EbarimtResponse {
  id: string;
  ebarimtBy: string;
  gWalletId: string;
  gWalletCustomerId: string;
  ebarimtReceiverType: string;
  ebarimtReceiver: string;
  ebarimtDistrictCode: string;
  ebarimtBillType: string;
  gMerchantId: string;
  merchantBranchCode: string;
  merchantTerminalCode?: string;
  merchantStaffCode?: string;
  merchantRegisterNo: string;
  gPaymentId: string;
  paidBy: string;
  objectType: string;
  objectId: string;
  amount: string;
  vatAmount: string;
  cityTaxAmount: string;
  ebarimtQrData: string;
  ebarimtLottery: string;
  note?: string;
  barimtStatus: string;
  barimtStatusDate: string;
  ebarimtSentEmail?: string;
  ebarimtReceiverPhone: string;
  taxType: string;
  merchantTin?: string;
  ebarimtReceiptId?: string;
  createdBy: string;
  createdDate: string;
  updatedBy: string;
  updatedDate: string;
  status: boolean;
  barimtItems?: EbarimtItem[];
  barimtTransactions?: unknown[];
  barimtHistories?: EbarimtHistory[];
}

export interface EbarimtItem {
  id: string;
  barimtId: string;
  merchantProductCode?: string;
  taxProductCode: string;
  barCode?: string;
  name: string;
  unitPrice: string;
  quantity: string;
  amount: string;
  cityTaxAmount: string;
  vatAmount: string;
  note?: string;
  createdBy: string;
  createdDate: string;
  updatedBy: string;
  updatedDate: string;
  status: boolean;
}

export interface EbarimtHistory {
  id: string;
  barimtId: string;
  ebarimtReceiverType: string;
  ebarimtReceiver: string;
  ebarimtRegisterNo?: string;
  ebarimtBillId: string;
  ebarimtDate: string;
  ebarimtMacAddress: string;
  ebarimtInternalCode: string;
  ebarimtBillType: string;
  ebarimtQrData: string;
  ebarimtLottery: string;
  ebarimtLotteryMsg?: string;
  ebarimtErrorCode?: string;
  ebarimtErrorMsg?: string;
  ebarimtResponseCode?: string;
  ebarimtResponseMsg?: string;
  note?: string;
  barimtStatus: string;
  barimtStatusDate: string;
  ebarimtSentEmail?: string;
  ebarimtReceiverPhone: string;
  taxType: string;
  createdBy: string;
  createdDate: string;
  updatedBy: string;
  updatedDate: string;
  status: boolean;
}
