/**
 * IG.com API Client
 * Handles authentication and API calls to IG's REST API
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import type {
  IGCredentials,
  IGSession,
  IGResponse,
  AccountInfo,
  MarketData,
  HistoricalPrice,
  Position,
  Order,
  TradeRequest,
} from './types.js';

export class IGClient {
  private apiKey: string;
  private baseUrl: string;
  private axiosInstance: AxiosInstance;

  constructor(apiKey: string, baseUrl: string = 'https://api.ig.com/gateway/deal') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-IG-API-KEY': this.apiKey,
        'Version': '2',
      },
    });
  }

  /**
   * Authenticate with IG API
   */
  async authenticate(credentials: IGCredentials): Promise<IGResponse<IGSession>> {
    try {
      const response = await this.axiosInstance.post(
        '/session',
        {
          identifier: credentials.username,
          password: credentials.password,
        },
        {
          headers: {
            'Version': '2',
          },
        }
      );

      const cst = response.headers['cst'];
      const xSecurityToken = response.headers['x-security-token'];

      if (!cst || !xSecurityToken) {
        return {
          success: false,
          error: {
            errorCode: 'AUTH_ERROR',
            errorMessage: 'Missing authentication tokens in response',
          },
          debug: {
            status: response.status,
            response: response.headers,
          },
          userMessage: 'Authentication failed: Invalid response from IG API',
        };
      }

      const session: IGSession = {
        cst,
        xSecurityToken,
        clientSessionToken: cst,
        securityToken: xSecurityToken,
        accountId: response.data.accountId,
        accountType: response.data.accountType,
        lightstreamerEndpoint: response.data.lightstreamerEndpoint,
        authenticated: true,
        authenticatedAt: new Date(),
      };

      // Set default headers for subsequent requests
      this.axiosInstance.defaults.headers['CST'] = cst;
      this.axiosInstance.defaults.headers['X-SECURITY-TOKEN'] = xSecurityToken;

      return {
        success: true,
        data: session,
        userMessage: 'Successfully authenticated with IG API',
      };
    } catch (error) {
      return this.handleError<IGSession>(error, 'Authentication failed');
    }
  }

  /**
   * Set session tokens for API calls
   */
  setSession(session: IGSession): void {
    if (session.cst && session.xSecurityToken) {
      this.axiosInstance.defaults.headers['CST'] = session.cst;
      this.axiosInstance.defaults.headers['X-SECURITY-TOKEN'] = session.xSecurityToken;
    }
  }

  /**
   * Get account information
   */
  async getAccounts(): Promise<IGResponse<AccountInfo[]>> {
    try {
      const response = await this.axiosInstance.get('/accounts', {
        headers: { Version: '1' },
      });

      return {
        success: true,
        data: response.data.accounts,
        userMessage: 'Account information retrieved successfully',
      };
    } catch (error) {
      return this.handleError<AccountInfo[]>(error, 'Failed to retrieve account information');
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: string): Promise<IGResponse<AccountInfo>> {
    try {
      const response = await this.axiosInstance.get(`/accounts/${accountId}`, {
        headers: { Version: '1' },
      });

      return {
        success: true,
        data: response.data,
        userMessage: `Account balance for ${accountId} retrieved successfully`,
      };
    } catch (error) {
      return this.handleError<AccountInfo>(error, `Failed to retrieve balance for account ${accountId}`);
    }
  }

  /**
   * Get positions
   */
  async getPositions(): Promise<IGResponse<Position[]>> {
    try {
      const response = await this.axiosInstance.get('/positions', {
        headers: { Version: '2' },
      });

      return {
        success: true,
        data: response.data.positions,
        userMessage: 'Positions retrieved successfully',
      };
    } catch (error) {
      return this.handleError<Position[]>(error, 'Failed to retrieve positions');
    }
  }

  /**
   * Get open positions
   */
  async getOpenPositions(): Promise<IGResponse<Position[]>> {
    try {
      const response = await this.axiosInstance.get('/positions', {
        headers: { Version: '2' },
      });

      const openPositions = response.data.positions?.filter(
        (p: Position) => p.status === 'OPEN'
      ) || [];

      return {
        success: true,
        data: openPositions,
        userMessage: 'Open positions retrieved successfully',
      };
    } catch (error) {
      return this.handleError<Position[]>(error, 'Failed to retrieve open positions');
    }
  }

  /**
   * Close a position
   */
  async closePosition(dealId: string, direction: 'BUY' | 'SELL', size: number): Promise<IGResponse> {
    try {
      const response = await this.axiosInstance.delete(
        `/positions/otc`,
        {
          data: {
            dealId,
            direction: direction === 'BUY' ? 'SELL' : 'BUY', // Opposite direction to close
            size,
            orderType: 'MARKET',
            timeInForce: 'FILL_OR_KILL',
          },
          headers: { Version: '1' },
        }
      );

      return {
        success: true,
        data: response.data,
        userMessage: `Position ${dealId} closed successfully`,
      };
    } catch (error) {
      return this.handleError<unknown>(error, `Failed to close position ${dealId}`);
    }
  }

  /**
   * Place an order
   */
  async placeOrder(request: TradeRequest, accountId?: string): Promise<IGResponse> {
    try {
      const payload = {
        epic: request.epic,
        expiry: request.expiry,
        direction: request.direction,
        size: request.size,
        orderType: request.orderType || 'MARKET',
        timeInForce: request.timeInForce || 'EXECUTE_AND_ELIMINATE',
        level: request.level,
        guaranteedStop: request.guaranteedStop || false,
        stopLevel: request.stopLevel,
        stopDistance: request.stopDistance,
        limitLevel: request.limitLevel,
        limitDistance: request.limitDistance,
        currencyCode: request.currencyCode,
        forceOpen: request.forceOpen !== false,
        goodTillDate: request.goodTillDate,
      };

      // Remove undefined values
      Object.keys(payload).forEach(
        (key) => payload[key as keyof typeof payload] === undefined && delete payload[key as keyof typeof payload]
      );

      // Log the request payload for debugging
      console.error('[IG API] Placing order with payload:', JSON.stringify(payload, null, 2));
      console.error('[IG API] Account ID:', accountId);
      
      const response = await this.axiosInstance.post('/positions/otc', payload, {
        headers: {
          Version: '2',
          ...(accountId && { 'IG-ACCOUNT-ID': accountId }),
        },
      });

      // Log the full response to help debug
      console.error('[IG API] Order placement response:', JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
      }, null, 2));
      
      // Check if we actually got a deal reference or deal ID
      const dealReference = response.data?.dealReference || response.data?.dealReferenceId;
      const dealId = response.data?.dealId;
      
      if (!dealReference && !dealId) {
        console.error('[IG API] WARNING: Order placement returned success but no deal reference or deal ID');
        console.error('[IG API] Full response data:', JSON.stringify(response.data, null, 2));
      }
      
      return {
        success: true,
        data: response.data,
        userMessage: dealReference 
          ? `Order placed successfully. Deal reference: ${dealReference}` 
          : dealId
          ? `Order placed successfully. Deal ID: ${dealId}`
          : `Order accepted but no deal reference received. Response: ${JSON.stringify(response.data)}`,
      };
    } catch (error) {
      return this.handleError<unknown>(error, 'Failed to place order');
    }
  }

  /**
   * Get working orders
   */
  async getWorkingOrders(): Promise<IGResponse<Order[]>> {
    try {
      const response = await this.axiosInstance.get('/workingorders', {
        headers: { Version: '2' },
      });

      return {
        success: true,
        data: response.data.workingOrders,
        userMessage: 'Working orders retrieved successfully',
      };
    } catch (error) {
      return this.handleError<Order[]>(error, 'Failed to retrieve working orders');
    }
  }

  /**
   * Delete a working order
   */
  async deleteWorkingOrder(dealId: string): Promise<IGResponse> {
    try {
      const response = await this.axiosInstance.delete(`/workingorders/otc/${dealId}`, {
        headers: { Version: '2' },
      });

      return {
        success: true,
        data: response.data,
        userMessage: `Working order ${dealId} deleted successfully`,
      };
    } catch (error) {
      return this.handleError<unknown>(error, `Failed to delete working order ${dealId}`);
    }
  }

  /**
   * Get market data for an epic
   */
  async getMarketData(epic: string): Promise<IGResponse<MarketData>> {
    try {
      const response = await this.axiosInstance.get(`/markets/${epic}`, {
        headers: { Version: '3' },
      });

      return {
        success: true,
        data: response.data,
        userMessage: `Market data for ${epic} retrieved successfully`,
      };
    } catch (error) {
      return this.handleError<MarketData>(error, `Failed to retrieve market data for ${epic}`);
    }
  }

  /**
   * Search for instruments
   */
  async searchInstruments(searchTerm: string): Promise<IGResponse> {
    try {
      const response = await this.axiosInstance.get('/markets', {
        params: {
          searchTerm,
        },
        headers: { Version: '1' },
      });

      return {
        success: true,
        data: response.data,
        userMessage: `Search results for "${searchTerm}" retrieved successfully`,
      };
    } catch (error) {
      return this.handleError<unknown>(error, `Failed to search for instruments matching "${searchTerm}"`);
    }
  }

  /**
   * Get historical prices
   */
  async getHistoricalPrices(
    epic: string,
    resolution: 'MINUTE' | 'MINUTE_2' | 'MINUTE_3' | 'MINUTE_5' | 'MINUTE_10' | 'MINUTE_15' | 'MINUTE_30' | 'HOUR' | 'HOUR_2' | 'HOUR_3' | 'HOUR_4' | 'DAY' | 'WEEK' | 'MONTH',
    from: string,
    to: string,
    pageSize: number = 100
  ): Promise<IGResponse<{ prices: HistoricalPrice[] }>> {
    try {
      const response = await this.axiosInstance.get(`/prices/${epic}/${resolution}/${from}/${to}`, {
        params: {
          pageSize,
        },
        headers: { Version: '2' },
      });

      return {
        success: true,
        data: { prices: response.data.prices },
        userMessage: `Historical prices for ${epic} retrieved successfully`,
      };
    } catch (error) {
      return this.handleError<{ prices: HistoricalPrice[] }>(error, `Failed to retrieve historical prices for ${epic}`);
    }
  }

  /**
   * Get watchlists
   */
  async getWatchlists(): Promise<IGResponse> {
    try {
      const response = await this.axiosInstance.get('/watchlists', {
        headers: { Version: '1' },
      });

      return {
        success: true,
        data: response.data,
        userMessage: 'Watchlists retrieved successfully',
      };
    } catch (error) {
      return this.handleError<unknown>(error, 'Failed to retrieve watchlists');
    }
  }

  /**
   * Get watchlist markets
   */
  async getWatchlistMarkets(watchlistId: string): Promise<IGResponse> {
    try {
      const response = await this.axiosInstance.get(`/watchlists/${watchlistId}`, {
        headers: { Version: '1' },
      });

      return {
        success: true,
        data: response.data,
        userMessage: `Watchlist ${watchlistId} markets retrieved successfully`,
      };
    } catch (error) {
      return this.handleError<unknown>(error, `Failed to retrieve watchlist ${watchlistId} markets`);
    }
  }

  /**
   * Generic API caller for flexible endpoint access
   */
  async callAPI(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    payload?: unknown,
    version: string = '1',
    additionalHeaders?: Record<string, string>
  ): Promise<IGResponse> {
    try {
      const config: AxiosRequestConfig = {
        method,
        url: endpoint.startsWith('/') ? endpoint : `/${endpoint}`,
        headers: {
          Version: version,
          ...additionalHeaders,
        },
      };

      if (payload && (method === 'POST' || method === 'PUT')) {
        config.data = payload;
      } else if (payload && method === 'GET') {
        config.params = payload;
      }

      const response = await this.axiosInstance.request(config);

      return {
        success: true,
        data: response.data,
        userMessage: `API call to ${endpoint} completed successfully`,
      };
    } catch (error) {
      return this.handleError<unknown>(error, `Failed to call API endpoint: ${endpoint}`);
    }
  }

  /**
   * Handle API errors and format responses
   */
  private handleError<T = unknown>(error: unknown, userMessage: string): IGResponse<T> {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ errorCode: string; errorMessage: string }>;
      const status = axiosError.response?.status;
      const errorData = axiosError.response?.data;

      let errorCode = 'UNKNOWN_ERROR';
      let errorMessage = axiosError.message;

      if (errorData) {
        if (typeof errorData === 'object' && 'errorCode' in errorData) {
          errorCode = errorData.errorCode;
          errorMessage = errorData.errorMessage || errorMessage;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        }
      }

      // Provide user-friendly messages for common errors
      let friendlyMessage = userMessage;
      if (status === 401 || status === 403) {
        friendlyMessage = 'Authentication failed. Please check your credentials and try logging in again.';
      } else if (status === 404) {
        friendlyMessage = 'The requested resource was not found. Please check the parameters.';
      } else if (status === 429) {
        friendlyMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
      } else if (status === 500 || status === 502 || status === 503) {
        friendlyMessage = 'IG API is currently unavailable. Please try again later.';
      }

      return {
        success: false,
        error: {
          errorCode,
          errorMessage,
        },
        debug: {
          status,
          statusText: axiosError.response?.statusText,
          response: errorData,
          request: {
            url: axiosError.config?.url,
            method: axiosError.config?.method,
            data: axiosError.config?.data,
          },
        },
        userMessage: friendlyMessage,
      };
    }

    // Non-Axios error
    const errorObj = error as Error;
    return {
      success: false,
      error: {
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: errorObj.message || String(error),
      },
      debug: {
        error: errorObj,
      },
      userMessage,
    };
  }
}

