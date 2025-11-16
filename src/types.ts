/**
 * Types for IG API integration
 */

export interface IGCredentials {
  username: string;
  password: string;
  apiKey: string;
}

export interface IGSession {
  securityToken?: string;
  clientSessionToken?: string;
  cst?: string;
  xSecurityToken?: string;
  accountId?: string;
  accountType?: string;
  lightstreamerEndpoint?: string;
  authenticated: boolean;
  authenticatedAt?: Date;
}

export interface IGError {
  errorCode: string;
  errorMessage: string;
}

export interface IGResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: IGError;
  debug?: {
    status?: number;
    statusText?: string;
    response?: unknown;
    request?: unknown;
  };
  userMessage?: string;
}

export interface AccountInfo {
  accountId: string;
  accountName: string;
  accountType: string;
  balance: {
    balance: number;
    deposit: number;
    profitLoss: number;
    available: number;
  };
  currency: string;
  preferred: boolean;
}

export interface MarketData {
  bid: number;
  ask: number;
  lastTradedPrice?: number;
  instrumentName: string;
  epic: string;
  expiry?: string;
  instrumentType: string;
  marketStatus: string;
  snapshotTime: string;
  snapshotTimeUTC: string;
}

export interface HistoricalPrice {
  snapshotTime: string;
  snapshotTimeUTC: string;
  openPrice: {
    bid: number;
    ask: number;
  };
  closePrice: {
    bid: number;
    ask: number;
  };
  highPrice: {
    bid: number;
    ask: number;
  };
  lowPrice: {
    bid: number;
    ask: number;
  };
  lastTradedVolume: number;
}

export interface Position {
  contractSize: number;
  createdDate: string;
  createdDateUTC: string;
  currency: string;
  dealId: string;
  dealReference: string;
  direction: 'BUY' | 'SELL';
  level: number;
  limitLevel?: number;
  size: number;
  status: string;
  stopLevel?: number;
  trailingStep?: number;
  trailingStopDistance?: number;
  instrumentName: string;
  epic: string;
  expiry?: string;
  profit?: number;
  profitCurrency?: string;
}

export interface Order {
  dealId: string;
  dealReference: string;
  epic: string;
  instrumentName: string;
  expiry?: string;
  direction: 'BUY' | 'SELL';
  orderType: 'LIMIT' | 'STOP';
  size: number;
  level: number;
  timeInForce: string;
  goodTillDate?: string;
  createdAt: string;
  status: string;
}

export interface TradeRequest {
  epic: string;
  expiry?: string;
  direction: 'BUY' | 'SELL';
  size: number;
  orderType?: 'MARKET' | 'LIMIT' | 'STOP';
  level?: number;
  timeInForce?: 'EXECUTE_AND_ELIMINATE' | 'FILL_OR_KILL' | 'GOOD_TILL_CANCELLED' | 'GOOD_TILL_DATE';
  goodTillDate?: string;
  guaranteedStop?: boolean;
  stopLevel?: number;
  stopDistance?: number;
  limitLevel?: number;
  limitDistance?: number;
  currencyCode?: string;
  forceOpen?: boolean;
}

