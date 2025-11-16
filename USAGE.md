# IG MCP Server - Quick Usage Guide

## Getting Started

### 1. Setup

```bash
npm install
npm run build
```

### 2. Configure

Set environment variables or use `.env` file:

```bash
export IG_API_KEY=your_api_key
export IG_USERNAME=your_username
export IG_PASSWORD=your_password
export IG_API_URL=https://api.ig.com/gateway/deal
```

### 3. Run

```bash
npm start
```

Or for development:

```bash
npm run dev
```

## Using with ChatGPT

### First, authenticate

If credentials are not in environment variables, ChatGPT will prompt you:

```
Tool: ig_login
Arguments: {
  "username": "your_username",
  "password": "your_password",
  "apiKey": "your_api_key"
}
```

If credentials are in environment variables, you can call `ig_login` without parameters.

### Common Operations

#### Check Account Balance

```
Tool: ig_get_accounts
```

Then use the account ID:

```
Tool: ig_get_account_balance
Arguments: {
  "accountId": "ABC123"
}
```

#### Search for Instruments

```
Tool: ig_search_instruments
Arguments: {
  "searchTerm": "FTSE"
}
```

#### Get Market Data

```
Tool: ig_get_market_data
Arguments: {
  "epic": "IX.D.FTSE.IFM.IP"
}
```

#### Place an Order

```
Tool: ig_place_order
Arguments: {
  "epic": "IX.D.FTSE.IFM.IP",
  "direction": "BUY",
  "size": 1,
  "orderType": "MARKET"
}
```

#### Get Historical Prices

```
Tool: ig_get_historical_prices
Arguments: {
  "epic": "IX.D.FTSE.IFM.IP",
  "resolution": "DAY",
  "from": "2024-01-01T00:00:00",
  "to": "2024-01-31T23:59:59"
}
```

#### Get Open Positions

```
Tool: ig_get_open_positions
```

#### Close a Position

```
Tool: ig_close_position
Arguments: {
  "dealId": "DEAL123",
  "direction": "BUY",
  "size": 1
}
```

#### Generic API Call

For any IG API endpoint not directly exposed:

```
Tool: ig_call_api
Arguments: {
  "method": "GET",
  "endpoint": "/markets",
  "payload": {
    "searchTerm": "Apple"
  },
  "version": "1"
}
```

## Error Handling

All responses include:
- `message`: User-friendly message
- `data`: Response data (if successful)
- `debug`: Detailed error information (if failed)

Example error response:

```json
{
  "message": "Authentication failed. Please check your credentials.",
  "debug": {
    "status": 401,
    "statusText": "Unauthorized",
    "response": { ... }
  }
}
```

## Security Notes

1. **Never commit credentials** to version control
2. **Use environment variables** in production (Railway, etc.)
3. **Sessions are per-connection** - isolated in memory
4. **Logout** when done to clear session

## Two-Factor Authentication

If your IG account has 2FA enabled, append the 6-digit code to your password:

```
password: "MyPassword123456"
```

## Troubleshooting

### Authentication Errors

- Verify API key, username, and password
- Check that you're using the correct API URL (live vs demo)
- For 2FA, append code to password

### Session Expiry

IG sessions are valid for 6 hours initially and extend with activity. If you get authentication errors, try logging in again.

### Connection Issues

- Ensure server is running
- Check network connectivity to IG API
- Verify environment variables are set correctly

