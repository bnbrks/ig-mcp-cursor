#!/usr/bin/env node

/**
 * IG.com MCP Server
 * Provides ChatGPT access to IG.com trading APIs
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { IGClient } from './ig-client.js';
import { SessionManager } from './session-manager.js';
import type { IGCredentials, IGSession } from './types.js';

// Get environment variables with defaults
const API_KEY = process.env.IG_API_KEY || '';
const USERNAME = process.env.IG_USERNAME || '';
const PASSWORD = process.env.IG_PASSWORD || '';
const API_URL = process.env.IG_API_URL || 'https://api.ig.com/gateway/deal';

// Security: Optional MCP server API key (recommended for public deployments)
const MCP_SERVER_API_KEY = process.env.MCP_SERVER_API_KEY || '';
const REQUIRE_ENV_CREDENTIALS = process.env.REQUIRE_ENV_CREDENTIALS === 'true';

// Security: Log warning if credentials are not set via environment (for production)
if (REQUIRE_ENV_CREDENTIALS && (!API_KEY || !USERNAME || !PASSWORD)) {
  console.error('SECURITY WARNING: REQUIRE_ENV_CREDENTIALS is enabled but credentials are missing!');
  console.error('Set IG_API_KEY, IG_USERNAME, and IG_PASSWORD environment variables.');
}

// Global client instance (will be created per connection)
const clients = new Map<string, IGClient>();

// Connection ID generator (in production, use actual connection context)
let currentConnectionId = SessionManager.generateConnectionId();

/**
 * Get or create IG client for a connection
 */
function getClient(connectionId: string): IGClient {
  if (!clients.has(connectionId)) {
    const apiKey = API_KEY || 'default-key';
    clients.set(connectionId, new IGClient(apiKey, API_URL));
  }
  return clients.get(connectionId)!;
}

/**
 * Get current session
 */
function getSession(connectionId: string): IGSession | null {
  return SessionManager.getSession(connectionId);
}

/**
 * Check if authenticated
 */
function ensureAuthenticated(connectionId: string): string | null {
  const session = getSession(connectionId);
  if (!session || !session.authenticated) {
    return 'Not authenticated. Please use the login tool first.';
  }
  return null;
}

/**
 * Format response for MCP
 */
function formatResponse(data: unknown, userMessage?: string, debug?: unknown): unknown {
  const result: Record<string, unknown> = {
    message: userMessage || 'Operation completed successfully',
    data,
  };
  
  if (debug && typeof debug === 'object') {
    result.debug = debug;
  }
  
  return result;
}

/**
 * Define MCP tools
 */
const tools: Tool[] = [
  {
    name: 'ig_login',
    description: 'Authenticate with IG.com API. Provide your username, password, and API key. If credentials are set via environment variables, you can call this without parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'IG.com username (optional if set via environment)',
        },
        password: {
          type: 'string',
          description: 'IG.com password (optional if set via environment). If using 2FA, append the 6-digit code to your password.',
        },
        apiKey: {
          type: 'string',
          description: 'IG.com API key (optional if set via environment)',
        },
      },
    },
  },
  {
    name: 'ig_logout',
    description: 'Log out from IG.com API and clear session',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ig_get_accounts',
    description: 'Get all accounts associated with the authenticated user',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ig_get_account_balance',
    description: 'Get account balance and details for a specific account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'Account ID to retrieve balance for',
        },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'ig_get_positions',
    description: 'Get all positions (open and closed)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ig_get_open_positions',
    description: 'Get only open positions',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ig_close_position',
    description: 'Close an existing position',
    inputSchema: {
      type: 'object',
      properties: {
        dealId: {
          type: 'string',
          description: 'Deal ID of the position to close',
        },
        direction: {
          type: 'string',
          enum: ['BUY', 'SELL'],
          description: 'Direction of the position (BUY for long, SELL for short)',
        },
        size: {
          type: 'number',
          description: 'Size of the position to close',
        },
      },
      required: ['dealId', 'direction', 'size'],
    },
  },
  {
    name: 'ig_place_order',
    description: 'Place a new trading order',
    inputSchema: {
      type: 'object',
      properties: {
        epic: {
          type: 'string',
          description: 'Instrument epic identifier (e.g., IX.D.FTSE.IFM.IP)',
        },
        expiry: {
          type: 'string',
          description: 'Expiry date (YYYY-MM-DD or YYYY-MM, required for some instruments)',
        },
        direction: {
          type: 'string',
          enum: ['BUY', 'SELL'],
          description: 'Trade direction',
        },
        size: {
          type: 'number',
          description: 'Trade size',
        },
        orderType: {
          type: 'string',
          enum: ['MARKET', 'LIMIT', 'STOP'],
          description: 'Order type (default: MARKET)',
        },
        level: {
          type: 'number',
          description: 'Price level for LIMIT or STOP orders',
        },
        timeInForce: {
          type: 'string',
          enum: ['EXECUTE_AND_ELIMINATE', 'FILL_OR_KILL', 'GOOD_TILL_CANCELLED', 'GOOD_TILL_DATE'],
          description: 'Time in force (default: EXECUTE_AND_ELIMINATE)',
        },
        goodTillDate: {
          type: 'string',
          description: 'Expiry date for GOOD_TILL_DATE orders (YYYY-MM-DD HH:MM)',
        },
        guaranteedStop: {
          type: 'boolean',
          description: 'Whether to use a guaranteed stop',
        },
        stopLevel: {
          type: 'number',
          description: 'Stop loss price level',
        },
        stopDistance: {
          type: 'number',
          description: 'Stop loss distance',
        },
        limitLevel: {
          type: 'number',
          description: 'Take profit price level',
        },
        limitDistance: {
          type: 'number',
          description: 'Take profit distance',
        },
        currencyCode: {
          type: 'string',
          description: 'Currency code (e.g., GBP, USD)',
        },
        forceOpen: {
          type: 'boolean',
          description: 'Force open a new position even if one exists (default: true)',
        },
        accountId: {
          type: 'string',
          description: 'Account ID to place order for (optional)',
        },
      },
      required: ['epic', 'direction', 'size'],
    },
  },
  {
    name: 'ig_get_working_orders',
    description: 'Get all working (pending) orders',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ig_delete_working_order',
    description: 'Delete a working order',
    inputSchema: {
      type: 'object',
      properties: {
        dealId: {
          type: 'string',
          description: 'Deal ID of the working order to delete',
        },
      },
      required: ['dealId'],
    },
  },
  {
    name: 'ig_get_market_data',
    description: 'Get current market data (bid, ask, prices) for an instrument',
    inputSchema: {
      type: 'object',
      properties: {
        epic: {
          type: 'string',
          description: 'Instrument epic identifier',
        },
      },
      required: ['epic'],
    },
  },
  {
    name: 'ig_search_instruments',
    description: 'Search for instruments by name or keyword',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term (e.g., "FTSE", "Apple", "EUR/USD")',
        },
      },
      required: ['searchTerm'],
    },
  },
  {
    name: 'ig_get_historical_prices',
    description: 'Get historical price data for an instrument',
    inputSchema: {
      type: 'object',
      properties: {
        epic: {
          type: 'string',
          description: 'Instrument epic identifier',
        },
        resolution: {
          type: 'string',
          enum: [
            'MINUTE',
            'MINUTE_2',
            'MINUTE_3',
            'MINUTE_5',
            'MINUTE_10',
            'MINUTE_15',
            'MINUTE_30',
            'HOUR',
            'HOUR_2',
            'HOUR_3',
            'HOUR_4',
            'DAY',
            'WEEK',
            'MONTH',
          ],
          description: 'Price resolution (e.g., MINUTE, HOUR, DAY)',
        },
        from: {
          type: 'string',
          description: 'Start date (YYYY-MM-DDTHH:mm:ss)',
        },
        to: {
          type: 'string',
          description: 'End date (YYYY-MM-DDTHH:mm:ss)',
        },
        pageSize: {
          type: 'number',
          description: 'Number of data points to retrieve (default: 100)',
        },
      },
      required: ['epic', 'resolution', 'from', 'to'],
    },
  },
  {
    name: 'ig_get_watchlists',
    description: 'Get all watchlists',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ig_get_watchlist_markets',
    description: 'Get markets in a specific watchlist',
    inputSchema: {
      type: 'object',
      properties: {
        watchlistId: {
          type: 'string',
          description: 'Watchlist ID',
        },
      },
      required: ['watchlistId'],
    },
  },
  {
    name: 'ig_call_api',
    description: 'Generic API caller for flexible endpoint access. Use this to call any IG API endpoint that may not be directly exposed by other tools.',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method',
        },
        endpoint: {
          type: 'string',
          description: 'API endpoint path (e.g., "/markets" or "/accounts")',
        },
        payload: {
          type: 'object',
          description: 'Request payload (for POST/PUT) or query parameters (for GET)',
        },
        version: {
          type: 'string',
          description: 'API version (default: "1")',
        },
        additionalHeaders: {
          type: 'object',
          description: 'Additional HTTP headers as key-value pairs',
        },
      },
      required: ['method', 'endpoint'],
    },
  },
];

/**
 * Create and configure MCP server
 */
const server = new Server(
  {
    name: 'ig-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

/**
 * Validate MCP server API key if required
 */
function validateApiKey(apiKey?: string): boolean {
  if (!MCP_SERVER_API_KEY) {
    return true; // No API key required
  }
  return apiKey === MCP_SERVER_API_KEY;
}

/**
 * Check if credentials should be allowed via tool call
 */
function allowToolCredentials(): boolean {
  return !REQUIRE_ENV_CREDENTIALS;
}

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const connectionId = currentConnectionId;
  const client = getClient(connectionId);

  // Security: Validate API key if required (for public deployments)
  const providedApiKey = (request as any).meta?.apiKey || (args as any)?.mcpApiKey;
  if (MCP_SERVER_API_KEY && !validateApiKey(providedApiKey)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            formatResponse(
              null,
              'Unauthorized: Invalid or missing MCP server API key. Please configure MCP_SERVER_API_KEY.',
              null
            ),
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case 'ig_login': {
        // Security: Check if credentials via tool are allowed
        const credentialsFromTool = !!(args?.username || args?.password || args?.apiKey);
        
        if (REQUIRE_ENV_CREDENTIALS && credentialsFromTool) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  formatResponse(
                    null,
                    'SECURITY: This server requires credentials to be set via environment variables only. Credentials cannot be passed through tool calls. Set IG_USERNAME, IG_PASSWORD, and IG_API_KEY as environment variables.',
                    { securityPolicy: 'REQUIRE_ENV_CREDENTIALS is enabled' }
                  ),
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Use provided credentials or fall back to environment variables
        const credentials: IGCredentials = {
          username: (args?.username as string) || USERNAME,
          password: (args?.password as string) || PASSWORD,
          apiKey: (args?.apiKey as string) || API_KEY,
        };

        if (!credentials.username || !credentials.password || !credentials.apiKey) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  formatResponse(
                    null,
                    'Missing credentials. Please provide username, password, and apiKey, or set them via environment variables (IG_USERNAME, IG_PASSWORD, IG_API_KEY).',
                    { 
                      provided: { 
                        username: !!args?.username, 
                        password: !!args?.password, 
                        apiKey: !!args?.apiKey 
                      }, 
                      envVarsSet: { 
                        username: !!USERNAME, 
                        password: !!PASSWORD, 
                        apiKey: !!API_KEY 
                      },
                      requireEnvCredentials: REQUIRE_ENV_CREDENTIALS
                    }
                  ),
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Security warning if credentials are provided via tool (not recommended)
        if (credentialsFromTool && !REQUIRE_ENV_CREDENTIALS) {
          console.error('SECURITY WARNING: Credentials provided via tool call. Consider using environment variables instead.');
        }

        // Update client with provided API key if different
        if (args?.apiKey && args.apiKey !== API_KEY) {
          clients.delete(connectionId);
          const newClient = new IGClient(credentials.apiKey, API_URL);
          clients.set(connectionId, newClient);
          const result = await newClient.authenticate(credentials);
          
          if (result.success && result.data) {
            SessionManager.setSession(connectionId, result.data);
            SessionManager.setCredentials(connectionId, credentials);
            newClient.setSession(result.data);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    formatResponse(
                      {
                        authenticated: true,
                        accountId: result.data.accountId,
                        accountType: result.data.accountType,
                      },
                      result.userMessage || 'Successfully authenticated',
                      { sessionToken: '***hidden***' }
                    ),
                    null,
                    2
                  ),
                },
              ],
              isError: false,
            };
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    formatResponse(
                      null,
                      result.userMessage || 'Authentication failed',
                      result.debug
                    ),
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }

        const result = await client.authenticate(credentials);

        if (result.success && result.data) {
          SessionManager.setSession(connectionId, result.data);
          SessionManager.setCredentials(connectionId, credentials);
          client.setSession(result.data);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  formatResponse(
                    {
                      authenticated: true,
                      accountId: result.data.accountId,
                      accountType: result.data.accountType,
                    },
                    result.userMessage || 'Successfully authenticated',
                    { sessionToken: '***hidden***' }
                  ),
                  null,
                  2
                ),
              },
            ],
            isError: false,
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  formatResponse(
                    null,
                    result.userMessage || 'Authentication failed',
                    result.debug
                  ),
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }

      case 'ig_logout': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        SessionManager.clearSession(connectionId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(null, 'Successfully logged out and session cleared'),
                null,
                2
              ),
            },
          ],
          isError: false,
        };
      }

      case 'ig_get_accounts': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const result = await client.getAccounts();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_get_account_balance': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const accountId = args?.accountId as string;
        const result = await client.getAccountBalance(accountId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_get_positions': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const result = await client.getPositions();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_get_open_positions': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const result = await client.getOpenPositions();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_close_position': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const dealId = args?.dealId as string;
        const direction = args?.direction as 'BUY' | 'SELL';
        const size = args?.size as number;

        const result = await client.closePosition(dealId, direction, size);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_place_order': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const accountId = args?.accountId as string | undefined;
        const orderRequest = {
          epic: args?.epic as string,
          expiry: args?.expiry as string | undefined,
          direction: args?.direction as 'BUY' | 'SELL',
          size: args?.size as number,
          orderType: args?.orderType as 'MARKET' | 'LIMIT' | 'STOP' | undefined,
          level: args?.level as number | undefined,
          timeInForce: args?.timeInForce as 'EXECUTE_AND_ELIMINATE' | 'FILL_OR_KILL' | 'GOOD_TILL_CANCELLED' | 'GOOD_TILL_DATE' | undefined,
          goodTillDate: args?.goodTillDate as string | undefined,
          guaranteedStop: args?.guaranteedStop as boolean | undefined,
          stopLevel: args?.stopLevel as number | undefined,
          stopDistance: args?.stopDistance as number | undefined,
          limitLevel: args?.limitLevel as number | undefined,
          limitDistance: args?.limitDistance as number | undefined,
          currencyCode: args?.currencyCode as string | undefined,
          forceOpen: args?.forceOpen as boolean | undefined,
        };

        const result = await client.placeOrder(orderRequest, accountId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_get_working_orders': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const result = await client.getWorkingOrders();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_delete_working_order': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const dealId = args?.dealId as string;
        const result = await client.deleteWorkingOrder(dealId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_get_market_data': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const epic = args?.epic as string;
        const result = await client.getMarketData(epic);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_search_instruments': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const searchTerm = args?.searchTerm as string;
        const result = await client.searchInstruments(searchTerm);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_get_historical_prices': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const epic = args?.epic as string;
        const resolution = args?.resolution as string;
        const from = args?.from as string;
        const to = args?.to as string;
        const pageSize = (args?.pageSize as number) || 100;

        const result = await client.getHistoricalPrices(epic, resolution as any, from, to, pageSize);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_get_watchlists': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const result = await client.getWatchlists();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_get_watchlist_markets': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const watchlistId = args?.watchlistId as string;
        const result = await client.getWatchlistMarkets(watchlistId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      case 'ig_call_api': {
        const authError = ensureAuthenticated(connectionId);
        if (authError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatResponse(null, authError), null, 2),
              },
            ],
            isError: true,
          };
        }

        const session = getSession(connectionId);
        if (session) {
          client.setSession(session);
        }

        const method = args?.method as 'GET' | 'POST' | 'PUT' | 'DELETE';
        const endpoint = args?.endpoint as string;
        const payload = args?.payload as unknown;
        const version = (args?.version as string) || '1';
        const additionalHeaders = args?.additionalHeaders as Record<string, string> | undefined;

        const result = await client.callAPI(method, endpoint, payload, version, additionalHeaders);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(result.data, result.userMessage, result.debug),
                null,
                2
              ),
            },
          ],
          isError: !result.success,
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                formatResponse(null, `Unknown tool: ${name}`, null),
                null,
                2
              ),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            formatResponse(
              null,
              `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
              { error: error instanceof Error ? error.stack : String(error) }
            ),
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('IG MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

