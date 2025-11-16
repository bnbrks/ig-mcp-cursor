# IG.com MCP Server

A Model Context Protocol (MCP) server that provides ChatGPT and other AI agents with access to IG.com's trading APIs. This server enables natural language interaction with IG.com for trading operations, market data retrieval, account management, and more.

## Features

- 🔐 **Secure Authentication**: Login via tool call or environment variables
- 💼 **Account Management**: View balances, accounts, and account details
- 📈 **Market Data**: Real-time and historical price data
- 📊 **Trading Operations**: Place orders, manage positions, and working orders
- 🔍 **Instrument Search**: Search for trading instruments by name or keyword
- 📋 **Watchlists**: Manage and view watchlists
- 🔧 **Generic API Caller**: Flexible access to any IG API endpoint
- 🚀 **Railway Ready**: Pre-configured for easy deployment on Railway

## Prerequisites

- Node.js 18+ or Docker
- IG.com account with API access
- IG.com API key (obtain from [IG Labs](https://labs.ig.com))

## Getting Started

### Local Development

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd ig-mcp-server
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables** (optional, but recommended):
   ```bash
   cp .env.example .env
   # Edit .env with your IG credentials
   ```

   Or set environment variables:
   ```bash
   export IG_API_KEY=your_api_key
   export IG_USERNAME=your_username
   export IG_PASSWORD=your_password
   export IG_API_URL=https://api.ig.com/gateway/deal
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

5. **Run the server**:
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

### IG.com API Setup

1. Log into your IG.com account
2. Navigate to **My Account** > **Settings** > **API Keys**
3. Generate a new API key
4. Note your API key, username, and password
5. If you have 2FA enabled, append the 6-digit code to your password when authenticating

## Usage with ChatGPT

### Configuration

Add the MCP server to your ChatGPT configuration:

```json
{
  "mcpServers": {
    "ig": {
      "command": "node",
      "args": ["/path/to/ig-mcp-server/dist/index.js"],
      "env": {
        "IG_API_KEY": "your_api_key",
        "IG_USERNAME": "your_username",
        "IG_PASSWORD": "your_password"
      }
    }
  }
}
```

### Authentication

If credentials are not set via environment variables, ChatGPT will prompt you for login details:

1. Use the `ig_login` tool with your credentials
2. The server will authenticate and store the session
3. Session remains active until logout or expiration

### Available Tools

#### Authentication
- **`ig_login`**: Authenticate with IG.com API
- **`ig_logout`**: Log out and clear session

#### Account Management
- **`ig_get_accounts`**: Get all accounts
- **`ig_get_account_balance`**: Get balance for a specific account

#### Trading
- **`ig_place_order`**: Place a new trading order
- **`ig_get_positions`**: Get all positions (open and closed)
- **`ig_get_open_positions`**: Get only open positions
- **`ig_close_position`**: Close an existing position
- **`ig_get_working_orders`**: Get pending/working orders
- **`ig_delete_working_order`**: Delete a working order

#### Market Data
- **`ig_get_market_data`**: Get current market data for an instrument
- **`ig_search_instruments`**: Search for instruments
- **`ig_get_historical_prices`**: Get historical price data

#### Watchlists
- **`ig_get_watchlists`**: Get all watchlists
- **`ig_get_watchlist_markets`**: Get markets in a watchlist

#### Generic API Access
- **`ig_call_api`**: Call any IG API endpoint directly

## Deployment on Railway

### Option 1: Using Railway CLI

1. **Install Railway CLI**:
   ```bash
   npm i -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Initialize Railway project**:
   ```bash
   railway init
   ```

4. **Set environment variables**:
   ```bash
   railway variables set IG_API_KEY=your_api_key
   railway variables set IG_USERNAME=your_username
   railway variables set IG_PASSWORD=your_password
   railway variables set IG_API_URL=https://api.ig.com/gateway/deal
   ```

5. **Deploy**:
   ```bash
   railway up
   ```

### Option 2: Using Railway Dashboard

1. **Create a new project** on [Railway](https://railway.app)
2. **Connect your GitHub repository**
3. **Add environment variables** in the Railway dashboard:
   - `IG_API_KEY`
   - `IG_USERNAME`
   - `IG_PASSWORD`
   - `IG_API_URL` (optional, defaults to live API)

4. **Deploy**: Railway will automatically detect the Dockerfile and deploy

### Option 3: Using Docker

The included Dockerfile can be used with any Docker-compatible platform:

```bash
docker build -t ig-mcp-server .
docker run --env-file .env ig-mcp-server
```

## Railway Deployment Notes

⚠️ **Important**: MCP servers communicate via **stdio (stdin/stdout)**, NOT HTTP. Railway deployment is primarily for keeping the service running. The agent connects locally through an MCP client, not via HTTP endpoints.

**See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for detailed Railway deployment guide.**

## Security Considerations

⚠️ **Important Security Notes**:

1. **Credentials**: Never commit credentials to version control. Use environment variables or Railway's secure variable storage.

2. **Session Management**: Sessions are stored in memory per connection. For production:
   - Consider implementing session encryption
   - Add session expiry based on your security requirements
   - Use connection-based isolation (already implemented)

3. **Public Access**: This server is designed to be used with ChatGPT's MCP integration, not as a publicly accessible API. Ensure proper network isolation.

4. **API Keys**: Rotate API keys regularly and use read-only keys when possible for non-trading operations.

### 🔒 Production Security Settings

For **publicly accessible deployments** (like Railway), enable strict security:

```bash
# Require credentials via environment variables only (no tool calls)
REQUIRE_ENV_CREDENTIALS=true

# Add MCP server API key for access control
MCP_SERVER_API_KEY=your_secure_random_key
```

**See [SECURITY.md](SECURITY.md) for comprehensive security guide.**

## API Reference

### IG.com API Documentation

Full API documentation is available at [labs.ig.com](https://labs.ig.com).

### Common Endpoints Used

- **Authentication**: `POST /session`
- **Accounts**: `GET /accounts`
- **Positions**: `GET /positions`
- **Orders**: `POST /positions/otc`
- **Market Data**: `GET /markets/{epic}`
- **Historical Prices**: `GET /prices/{epic}/{resolution}/{from}/{to}`

## Error Handling

The server returns both user-friendly messages and detailed debug information:

```json
{
  "message": "User-friendly error message",
  "data": { ... },
  "debug": {
    "status": 401,
    "statusText": "Unauthorized",
    "response": { ... }
  }
}
```

## Development

### Project Structure

```
ig-mcp-server/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── ig-client.ts       # IG API client
│   ├── session-manager.ts # Session management
│   └── types.ts           # TypeScript types
├── dist/                  # Compiled JavaScript
├── Dockerfile             # Docker configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint
```

### Development Mode

```bash
npm run dev
```

## Troubleshooting

### Authentication Issues

- Verify your API key, username, and password are correct
- If using 2FA, append the code to your password
- Check that you're using the correct API URL (live vs demo)

### Connection Issues

- Ensure the server is running and accessible
- Check network connectivity to IG API
- Verify environment variables are set correctly

### Session Expiry

- IG sessions are valid for 6 hours initially
- Sessions extend with activity
- If you encounter authentication errors, try logging in again

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- IG API Documentation: [labs.ig.com](https://labs.ig.com)
- IG Support: Contact IG.com support for API-related issues
- MCP Documentation: [Model Context Protocol](https://modelcontextprotocol.io)

## Disclaimer

This software is provided for educational and development purposes. Trading involves risk. Always test thoroughly with a demo account before using with live trading. The authors are not responsible for any financial losses.

