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
import { createServer, Server as HttpServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import formidable from 'formidable';
import OpenAI from 'openai';
import { IGClient } from './ig-client.js';
import { SessionManager } from './session-manager.js';
import type { IGCredentials, IGSession } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get environment variables with defaults
const API_KEY = process.env.IG_API_KEY || '';
const USERNAME = process.env.IG_USERNAME || '';
const PASSWORD = process.env.IG_PASSWORD || '';
const API_URL = process.env.IG_API_URL || 'https://api.ig.com/gateway/deal';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || '';

// Initialize OpenAI client
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Security: Optional MCP server API key (recommended for public deployments)
const MCP_SERVER_API_KEY = process.env.MCP_SERVER_API_KEY || '';
const REQUIRE_ENV_CREDENTIALS = process.env.REQUIRE_ENV_CREDENTIALS === 'true';
const REQUIRE_AUTHENTICATION = process.env.REQUIRE_AUTHENTICATION !== 'false'; // Default: true for security

// Security: Log warning if credentials are not set via environment (for production)
if (REQUIRE_ENV_CREDENTIALS && (!API_KEY || !USERNAME || !PASSWORD)) {
  console.error('SECURITY WARNING: REQUIRE_ENV_CREDENTIALS is enabled but credentials are missing!');
  console.error('Set IG_API_KEY, IG_USERNAME, and IG_PASSWORD environment variables.');
}

// Security: Track authenticated connections
const authenticatedConnections = new Set<string>();

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
    name: 'mcp_authenticate',
    description: 'Authenticate with the MCP server using an API key. Required before using other tools if MCP_SERVER_API_KEY is set. This prevents unauthorized access to your IG account.',
    inputSchema: {
      type: 'object',
      properties: {
        apiKey: {
          type: 'string',
          description: 'MCP Server API Key (from MCP_SERVER_API_KEY environment variable)',
        },
      },
      required: ['apiKey'],
    },
  },
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
 * Check if connection is authenticated
 */
function isConnectionAuthenticated(connectionId: string): boolean {
  if (!REQUIRE_AUTHENTICATION || !MCP_SERVER_API_KEY) {
    return true; // No authentication required
  }
  return authenticatedConnections.has(connectionId);
}

/**
 * Authenticate a connection
 */
function authenticateConnection(connectionId: string, apiKey?: string): boolean {
  if (!REQUIRE_AUTHENTICATION || !MCP_SERVER_API_KEY) {
    return true; // No authentication required
  }
  if (validateApiKey(apiKey)) {
    authenticatedConnections.add(connectionId);
    return true;
  }
  return false;
}

/**
 * Check if credentials should be allowed via tool call
 */
function allowToolCredentials(): boolean {
  return !REQUIRE_ENV_CREDENTIALS;
}

/**
 * Shared tool call handler logic (used by both stdio and HTTP transports)
 */
async function executeToolCall(name: string, args?: Record<string, unknown>) {
  const connectionId = currentConnectionId;
  const client = getClient(connectionId);

  try {
    // Security: Check if authentication is required for this connection
    if (!isConnectionAuthenticated(connectionId) && name !== 'mcp_authenticate') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              formatResponse(
                null,
                `Unauthorized: Connection not authenticated. Please call 'mcp_authenticate' first with your MCP_SERVER_API_KEY. This prevents unauthorized access to your IG account.`,
                { 
                  securityPolicy: 'Authentication required',
                  requiresAuthentication: REQUIRE_AUTHENTICATION,
                  apiKeyRequired: !!MCP_SERVER_API_KEY 
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

    switch (name) {
      case 'mcp_authenticate': {
        const providedApiKey = (args?.apiKey as string) || '';
        
        if (!MCP_SERVER_API_KEY) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  formatResponse(
                    { authenticated: true },
                    'No API key required. Server is open for connections.',
                    null
                  ),
                  null,
                  2
                ),
              },
            ],
            isError: false,
          };
        }

        if (authenticateConnection(connectionId, providedApiKey)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  formatResponse(
                    { authenticated: true, connectionId },
                    'Successfully authenticated with MCP server. You can now use IG API tools.',
                    null
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
                    'Authentication failed: Invalid API key. Please provide the correct MCP_SERVER_API_KEY.',
                    { authenticated: false }
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
}

/**
 * Register stdio transport handler (calls shared executeToolCall function)
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return executeToolCall(name, args);
});

/**
 * Handle tools/list request (used by HTTP transport)
 */
async function handleListTools(): Promise<{ tools: Tool[] }> {
  return { tools };
}

/**
 * Handle tools/call request (used by HTTP transport)
 */
async function handleCallTool(name: string, args?: Record<string, unknown>) {
  return executeToolCall(name, args);
}

/**
 * Handle MCP JSON-RPC request over HTTP
 */
async function handleMCPRequest(body: string): Promise<unknown> {
  try {
    const request = JSON.parse(body);

    // Validate JSON-RPC format
    if (request.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: request.id || null,
        error: {
          code: -32600,
          message: 'Invalid Request: jsonrpc must be "2.0"',
        },
      };
    }

    // Handle tools/list
    if (request.method === 'tools/list') {
      const result = await handleListTools();
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    }

    // Handle tools/call
    if (request.method === 'tools/call') {
      const result = await handleCallTool(
        request.params.name,
        request.params.arguments || {}
      );
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    }

    // Handle initialize
    if (request.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'ig-mcp-server',
            version: '1.0.0',
          },
        },
      };
    }

    // Unknown method
    return {
      jsonrpc: '2.0',
      id: request.id || null,
      error: {
        code: -32601,
        message: `Method not found: ${request.method}`,
      },
    };
  } catch (error) {
    console.error('MCP request parsing error:', error);
    return {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Start HTTP server with MCP endpoint support
 */
function startHTTPServer(): Promise<HttpServer> {
  const port = parseInt(process.env.PORT || '3000', 10);
  
  const httpServer = createServer(async (req, res) => {
    // Log all incoming requests for debugging
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${req.headers['user-agent'] || 'unknown'}`);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
      console.error(`[${new Date().toISOString()}] Handling OPTIONS request`);
      res.writeHead(200, corsHeaders);
      res.end();
      return;
    }

    // Health check endpoint
    if (req.url === '/health' && req.method === 'GET') {
      console.error(`[${new Date().toISOString()}] Handling health check request`);
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'ig-mcp-server',
        transport: 'http',
        endpoint: '/mcp',
        note: 'MCP server communicates via HTTP POST at /mcp endpoint',
      }));
      console.error(`[${new Date().toISOString()}] Health check response sent`);
      return;
    }

    // MCP endpoint
    if (req.url === '/mcp' && req.method === 'POST') {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          // Check if API key is provided in header for web requests
          const apiKeyHeader = req.headers['x-mcp-api-key'] as string | undefined;
          
          // For web requests, try to find an authenticated connection or authenticate with header
          const originalConnectionId = currentConnectionId;
          
          // If API key is provided in header, authenticate first
          if (apiKeyHeader && MCP_SERVER_API_KEY) {
            const webConnectionId = `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            currentConnectionId = webConnectionId;
            
            // Authenticate with the provided API key
            const authResult = await executeToolCall('mcp_authenticate', {
              apiKey: apiKeyHeader
            });
            
            if (authResult && typeof authResult === 'object' && 'isError' in authResult && authResult.isError) {
              // Authentication failed, try to find existing authenticated connection
              currentConnectionId = originalConnectionId;
            } else {
              console.error(`[DEBUG] Authenticated with API key header, connection: ${webConnectionId}`);
            }
          } else {
            // Try to find an authenticated connection
            if (!isConnectionAuthenticated(currentConnectionId)) {
              for (const [connId, session] of SessionManager.getAllSessions()) {
                if (session && session.authenticated && isConnectionAuthenticated(connId)) {
                  currentConnectionId = connId;
                  console.error(`[DEBUG] Using authenticated connection: ${connId}`);
                  break;
                }
              }
            }
          }
          
          const response = await handleMCPRequest(body);
          
          // Restore original connection ID
          currentConnectionId = originalConnectionId;
          
          res.writeHead(200, {
            'Content-Type': 'application/json',
            ...corsHeaders
          });
          res.end(JSON.stringify(response));
        } catch (error) {
          console.error('MCP request handler error:', error);
          res.writeHead(500, {
            'Content-Type': 'application/json',
            ...corsHeaders
          });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32603,
              message: 'Internal error',
              data: error instanceof Error ? error.message : String(error),
            },
          }));
        }
      });

      return;
    }

    // Serve static HTML page
    if (req.url === '/' && req.method === 'GET') {
      try {
        const htmlPath = join(__dirname, '../public/index.html');
        if (existsSync(htmlPath)) {
          const html = readFileSync(htmlPath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
          return;
        } else {
          // Fallback if HTML file doesn't exist
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html><body>
              <h1>IG MCP Server</h1>
              <p>Web interface not found. Please ensure public/index.html exists.</p>
              <p><a href="/health">Health Check</a></p>
            </body></html>
          `);
          return;
        }
      } catch (error) {
        console.error('Error serving HTML:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error serving page');
        return;
      }
    }

    // Web login endpoint (for web interface)
    if (req.url === '/api/login' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      
      req.on('end', async () => {
        try {
          const request = JSON.parse(body);
          
          // Generate a unique connection ID for this web session
          const webConnectionId = `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          // Temporarily set the connection ID for this request
          const originalConnectionId = currentConnectionId;
          currentConnectionId = webConnectionId;
          
          // Step 1: Authenticate with MCP server using the provided API key
          const mcpAuthResult = await executeToolCall('mcp_authenticate', {
            apiKey: request.apiKey
          });
          
          const mcpAuthError = mcpAuthResult && typeof mcpAuthResult === 'object' && 'isError' in mcpAuthResult && mcpAuthResult.isError;
          
          if (mcpAuthError) {
            // Restore original connection ID
            currentConnectionId = originalConnectionId;
            
            const mcpAuthText = mcpAuthResult && typeof mcpAuthResult === 'object' && 'content' in mcpAuthResult && Array.isArray(mcpAuthResult.content)
              ? mcpAuthResult.content[0]?.text || '{}'
              : JSON.stringify(mcpAuthResult);
            
            let mcpAuthData;
            try {
              mcpAuthData = JSON.parse(mcpAuthText);
            } catch {
              mcpAuthData = { message: mcpAuthText };
            }
            
            res.writeHead(401, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ 
              error: mcpAuthData.message || 'MCP server authentication failed' 
            }));
            return;
          }
          
          // Step 2: Auto-login to IG using environment variables
          // Ensure we have a client for this connection
          if (!clients.has(webConnectionId)) {
            clients.set(webConnectionId, new IGClient(API_KEY, API_URL));
          }
          
          // Login to IG using environment variables
          const igLoginResult = await executeToolCall('ig_login', {});
          
          // Restore original connection ID
          currentConnectionId = originalConnectionId;
          
          const isError = igLoginResult && typeof igLoginResult === 'object' && 'isError' in igLoginResult && igLoginResult.isError;
          
          res.writeHead(isError ? 401 : 200, {
            'Content-Type': 'application/json',
            ...corsHeaders
          });
          
          const responseText = igLoginResult && typeof igLoginResult === 'object' && 'content' in igLoginResult && Array.isArray(igLoginResult.content)
            ? igLoginResult.content[0]?.text || '{}'
            : JSON.stringify(igLoginResult);
          
          let responseData;
          try {
            responseData = JSON.parse(responseText);
            // Include connection ID in response for subsequent requests
            if (!isError && responseData.data) {
              responseData.data.connectionId = webConnectionId;
            }
          } catch {
            responseData = { message: responseText };
          }
          
          res.end(JSON.stringify(responseData));
        } catch (error) {
          console.error('Login error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Login failed' 
          }));
        }
      });
      return;
    }

    // Parse trades from image endpoint
    if (req.url === '/api/parse-trades' && req.method === 'POST') {
      try {
        const form = formidable({
          maxFileSize: 10 * 1024 * 1024, // 10MB
          keepExtensions: true,
        });
        
        const [fields, files] = await form.parse(req);
        const fileArray = files.image;
        
        if (!fileArray) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ error: 'No image file provided' }));
          return;
        }

        // formidable v3 returns files as arrays
        const fileList = Array.isArray(fileArray) ? fileArray : [fileArray];
        if (fileList.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ error: 'No image file provided' }));
          return;
        }

        const fileObj = fileList[0];
        if (!fileObj || typeof fileObj !== 'object' || !('filepath' in fileObj)) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ error: 'Invalid file upload' }));
          return;
        }

        const filepath = (fileObj as { filepath: string }).filepath;

        const imageBuffer = readFileSync(filepath);
        const base64Image = imageBuffer.toString('base64');

        if (!openai) {
          res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ error: 'OpenAI API key not configured' }));
          return;
        }

        // Use OpenAI Vision API to parse the image
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are a trading assistant. Analyze the screenshot and extract trade information from the table.
              
              The table typically has columns: Instrument, Long/Short, Entry, Stop Level, Target Price, Confidence
              
              Return a JSON array of trades, where each trade has:
              - instrument: The trading instrument name (e.g., "FTSE100", "FTSE", "Gold", "SP500", "Dax", "EUR/USD")
              - direction: "BUY" for LONG, "SELL" for SHORT
              - entry: The entry price (number, from Entry column)
              - stopLevel: The stop loss level (number, from Stop Level column)
              - targetPrice: The target/take profit price (number, from Target Price column - extract just the number, ignore "+" or "or lower" text)
              - size: Default trade size (use 0.01 as default, user will edit this)
              - orderType: "MARKET" (default)
              - expiry: "DFB" for daily funded bets (default for indices)
              - currencyCode: "GBP" for UK indices, "USD" for US indices (default "GBP")
              
              Return ONLY valid JSON, no other text. Example format:
              [{"instrument": "FTSE100", "direction": "BUY", "entry": 9610, "stopLevel": 9593, "targetPrice": 9750, "size": 0.01, "orderType": "MARKET", "expiry": "DFB", "currencyCode": "GBP"}]`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all trades from this screenshot. Return a JSON array of trade objects.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 1000,
        });

        const responseText = completion.choices[0]?.message?.content || '[]';
        let trades = [];
        
        try {
          // Extract JSON from response (handle markdown code blocks)
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            trades = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.error('Error parsing OpenAI response:', parseError);
          res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ error: 'Failed to parse trade data from image' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ trades }));
      } catch (error) {
        console.error('Error parsing trades:', error);
        res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
        res.end(JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Failed to parse trades' 
        }));
      }
      return;
    }

    // Place trades endpoint
    if (req.url === '/api/place-trades' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      
      req.on('end', async () => {
        try {
          const { trades } = JSON.parse(body);
          
          if (!Array.isArray(trades) || trades.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'No trades provided' }));
            return;
          }

          // Get connection ID from request or use default
          // For web interface, we'll use the first authenticated connection
          let connectionId = currentConnectionId;
          
          // Try to find an authenticated web connection
          if (!connectionId || !isConnectionAuthenticated(connectionId)) {
            // Find any authenticated connection
            for (const [connId, session] of SessionManager.getAllSessions()) {
              if (session && session.authenticated) {
                connectionId = connId;
                break;
              }
            }
          }
          
          if (!connectionId || !isConnectionAuthenticated(connectionId)) {
            res.writeHead(401, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'Not authenticated. Please login first.' }));
            return;
          }
          
          const client = getClient(connectionId);
          const session = getSession(connectionId);
          
          if (!session || !session.authenticated) {
            res.writeHead(401, { 'Content-Type': 'application/json', ...corsHeaders });
            res.end(JSON.stringify({ error: 'Not authenticated. Please login first.' }));
            return;
          }

          client.setSession(session);
          const accountId = DEFAULT_ACCOUNT_ID || session.accountId;

          const results = [];
          
          for (const trade of trades) {
            try {
              console.error(`[DEBUG] Processing trade: ${JSON.stringify(trade, null, 2)}`);
              
              // Map instrument name to epic
              let epic = trade.epic;
              if (!epic && trade.instrument) {
                // Try to map common instrument names to epics
                const instrumentUpper = trade.instrument.toUpperCase().trim();
                const instrumentMap: Record<string, string> = {
                  'FTSE': 'IX.D.FTSE.DAILY.IP',
                  'FTSE 100': 'IX.D.FTSE.DAILY.IP',
                  'FTSE100': 'IX.D.FTSE.DAILY.IP',
                  'FTSE 100 DAILY': 'IX.D.FTSE.DAILY.IP',
                  'GOLD': 'CS.D.XAUUSD.CFD.IP',
                  'SP500': 'IX.D.SPTRD.DAILY.IP',
                  'S&P 500': 'IX.D.SPTRD.DAILY.IP',
                  'SPX': 'IX.D.SPTRD.DAILY.IP',
                  'DAX': 'IX.D.DAX.DAILY.IP',
                };
                epic = instrumentMap[instrumentUpper];
                
                // If not found in map, try searching for the instrument
                if (!epic) {
                  console.error(`Searching for instrument: ${trade.instrument}`);
                  const searchResult = await client.searchInstruments(trade.instrument);
                  if (searchResult.success && searchResult.data) {
                    const markets = (searchResult.data as any).markets || [];
                    if (markets.length > 0) {
                      // Try to find a daily/spread bet instrument
                      const dailyInstrument = markets.find((m: any) => 
                        m.epic && (m.epic.includes('.DAILY.') || m.instrumentType === 'SPREADBET')
                      );
                      epic = dailyInstrument?.epic || markets[0]?.epic;
                      console.error(`Found epic: ${epic} for instrument: ${trade.instrument}`);
                    }
                  }
                }
                
                // If still no epic, use the instrument name as-is (might work for some cases)
                if (!epic) {
                  epic = trade.instrument;
                }
              }
              
              if (!epic) {
                throw new Error(`No epic found for instrument: ${trade.instrument}`);
              }

              // Parse entry, stop level and target price
              let entryLevel: number | undefined;
              let stopLevel: number | undefined;
              let limitLevel: number | undefined;
              
              if (trade.entry) {
                entryLevel = typeof trade.entry === 'number' ? trade.entry : parseFloat(String(trade.entry));
              }
              
              if (trade.stopLevel) {
                stopLevel = typeof trade.stopLevel === 'number' ? trade.stopLevel : parseFloat(String(trade.stopLevel));
              }
              
              if (trade.targetPrice) {
                // Extract number from target price (handle "+" or "or lower" text)
                const targetStr = String(trade.targetPrice).replace(/[^0-9.-]/g, '');
                limitLevel = parseFloat(targetStr);
              }

              // Use LIMIT order at entry price, not MARKET
              // Note: GOOD_TILL_DATE is not supported for limit orders on OTC positions
              // We'll use EXECUTE_AND_ELIMINATE which is the default for limit orders
              // The order will remain active until filled or manually cancelled
              // TODO: If expiry at 20:00 is required, consider using a scheduled job to cancel orders
              const orderRequest = {
                epic: epic,
                expiry: trade.expiry || 'DFB',
                direction: trade.direction as 'BUY' | 'SELL',
                size: parseFloat(trade.size) || 0.01,
                orderType: 'LIMIT' as const, // Always use LIMIT order
                level: entryLevel, // Entry price for limit order
                currencyCode: 'GBP' as const, // Always use GBP
                stopLevel: stopLevel,
                limitLevel: limitLevel, // Take profit level
                timeInForce: 'EXECUTE_AND_ELIMINATE' as const, // Only valid option for OTC limit orders
              };

              console.error(`[DEBUG] Order request for ${trade.instrument}:`, JSON.stringify(orderRequest, null, 2));
              console.error(`[DEBUG] Account ID: ${accountId}`);
              
              const result = await client.placeOrder(orderRequest, accountId);
              
              console.error(`[DEBUG] Order result for ${trade.instrument}:`, JSON.stringify({
                success: result.success,
                userMessage: result.userMessage,
                error: result.error,
                debug: result.debug,
                data: result.data
              }, null, 2));
              
              results.push({
                success: result.success,
                message: result.userMessage || (result.success ? 'Order placed' : 'Order failed'),
                dealReference: result.data && typeof result.data === 'object' && 'dealReference' in result.data 
                  ? (result.data as any).dealReference 
                  : undefined,
                error: result.error,
                debug: result.debug ? JSON.stringify(result.debug) : undefined,
              });
            } catch (error) {
              console.error(`[DEBUG] Exception placing order for ${trade.instrument}:`, error);
              if (error instanceof Error) {
                console.error(`[DEBUG] Error stack:`, error.stack);
              }
              results.push({
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error',
                error: String(error),
                debug: error instanceof Error ? error.stack : undefined,
              });
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ results }));
        } catch (error) {
          console.error('Error placing trades:', error);
          res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
          res.end(JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Failed to place trades' 
          }));
        }
      });
      return;
    }

    // 404 for other endpoints
    res.writeHead(404, { 
      'Content-Type': 'application/json',
      ...corsHeaders 
    });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return new Promise((resolve, reject) => {
    httpServer.listen(port, '0.0.0.0', () => {
      const address = httpServer.address();
      console.error(`IG MCP Server running on HTTP port ${port}`);
      console.error(`Server address: ${JSON.stringify(address)}`);
      console.error(`MCP endpoint: http://0.0.0.0:${port}/mcp`);
      console.error(`Health check: http://0.0.0.0:${port}/health`);
      console.error(`Environment PORT: ${process.env.PORT || 'not set'}`);
      console.error(`Listening on: 0.0.0.0:${port}`);
      
      // Verify server is actually listening
      if (httpServer.listening) {
        console.error('✓ Server is confirmed listening');
      } else {
        console.error('✗ WARNING: Server reports it is NOT listening!');
      }
      
      resolve(httpServer);
    });

    httpServer.on('error', (error: Error) => {
      console.error('HTTP server error:', error);
      console.error('Error details:', {
        code: (error as any).code,
        errno: (error as any).errno,
        syscall: (error as any).syscall,
        address: (error as any).address,
        port: (error as any).port,
      });
      reject(error);
    });
    
    // Log when server closes
    httpServer.on('close', () => {
      console.error('HTTP server closed');
    });
  });
}

/**
 * Start the server
 */
async function main() {
  try {
    // Start HTTP server with MCP endpoint support and wait for it to be ready
    const httpServer = await startHTTPServer();

    // Only start stdio transport if stdin is available (local development)
    // In Railway/production environments, stdin may not be available, so skip stdio
    if (process.stdin.isTTY) {
      try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error('IG MCP Server running on both HTTP and stdio');
      } catch (error) {
        // If stdio connection fails, that's ok for HTTP-only mode
        console.error('Note: stdio transport not available, HTTP transport only');
      }
    } else {
      console.error('IG MCP Server running on HTTP only (no stdio available)');
    }

    // Handle server errors gracefully
    httpServer.on('error', (error: Error) => {
      console.error('HTTP server error:', error);
    });

    // Prevent process from exiting - handle graceful shutdown
    process.on('SIGTERM', () => {
      console.error('Received SIGTERM, shutting down gracefully...');
      httpServer.close(() => {
        console.error('HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.error('Received SIGINT, shutting down gracefully...');
      httpServer.close(() => {
        console.error('HTTP server closed');
        process.exit(0);
      });
    });

    // Keep process alive - prevent exit
    // The HTTP server should keep the event loop alive, but let's be explicit
    const keepAlive = setInterval(() => {
      // This interval keeps the process alive
      // It's a fallback in case something else tries to exit
    }, 10000); // Every 10 seconds

    // Log that we're ready
    console.error('Server started successfully, waiting for requests...');
    console.error('Process will stay alive as long as HTTP server is running');
    console.error(`Server listening status: ${httpServer.listening}`);
    console.error(`Server address: ${JSON.stringify(httpServer.address())}`);
    
    // Periodic heartbeat to confirm server is still alive
    const heartbeat = setInterval(() => {
      console.error(`[${new Date().toISOString()}] Heartbeat - Server still alive, listening: ${httpServer.listening}`);
    }, 30000); // Every 30 seconds
    
    // Clear heartbeat on shutdown
    process.on('SIGTERM', () => {
      clearInterval(heartbeat);
    });
    process.on('SIGINT', () => {
      clearInterval(heartbeat);
    });

    // Ensure we don't exit
    process.on('beforeExit', (code) => {
      console.error(`Process about to exit with code ${code}`);
      clearInterval(keepAlive);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Error stack:', error.stack);
  process.exit(1);
});

// Start the server
console.error('Starting IG MCP Server...');
main().catch((error) => {
  console.error('Fatal error in main():', error);
  if (error instanceof Error) {
    console.error('Error stack:', error.stack);
  }
  process.exit(1);
});

