# Railway Deployment Guide

## Important: How MCP Servers Work

**⚠️ CRITICAL UNDERSTANDING**: MCP servers communicate via **stdio (standard input/output)**, NOT HTTP. This means:

- The agent (ChatGPT) connects to the MCP server **locally** via the MCP client
- Communication happens through stdin/stdout, not HTTP endpoints
- The server does NOT expose HTTP endpoints for MCP communication
- Railway deployment is primarily for **keeping the server running**, not for remote HTTP access

## Port Configuration for Railway

### Port 3000 (Default)

Railway will automatically:
- Detect the `PORT` environment variable (or use 3000)
- Use this for health checks to keep the service alive
- The health check endpoint is available at `/health` or `/`

### Setting the Port

In Railway, you can:
1. **Use default (3000)**: No configuration needed
2. **Set custom port**: Add environment variable `PORT=your_port`

The Dockerfile exposes port 3000, but Railway will handle port mapping automatically.

## Railway Configuration

### Required Environment Variables

```
IG_API_KEY=your_ig_api_key
IG_USERNAME=your_ig_username
IG_PASSWORD=your_ig_password
MCP_SERVER_API_KEY=your_secure_random_key
REQUIRE_AUTHENTICATION=true
REQUIRE_ENV_CREDENTIALS=true
```

### Optional Environment Variables

```
PORT=3000                    # Port for health checks (default: 3000)
IG_API_URL=https://api.ig.com/gateway/deal
```

### Railway Setup Steps

1. **Create Railway Project**
   - Connect your GitHub repository

2. **Configure Environment Variables**
   - Go to Variables tab
   - Add all required variables as secrets

3. **Deploy**
   - Railway will automatically build and deploy
   - Health check endpoint will be available at `/health`

4. **Port Configuration**
   - Railway will automatically handle port mapping
   - No need to manually expose ports
   - The `PORT` environment variable will be set automatically by Railway

## Important Notes

### ❌ MCP Servers Are NOT HTTP APIs

- **Don't try to access MCP tools via HTTP** (e.g., `http://your-railway-url/ig_get_accounts`)
- MCP tools only work through MCP clients (ChatGPT, Cursor, etc.)
- The health check endpoint (`/health`) is just for keeping the service alive

### ✅ How to Actually Use the Server

The MCP server is used **locally** through an MCP client:

**In ChatGPT/Cursor configuration:**

```json
{
  "mcpServers": {
    "ig": {
      "command": "ssh",
      "args": ["user@your-railway-url", "node", "/app/dist/index.js"],
      "env": {
        "MCP_SERVER_API_KEY": "your_key_here"
      }
    }
  }
}
```

**OR** if you have a way to execute commands remotely, you can:

```json
{
  "mcpServers": {
    "ig": {
      "command": "railway",
      "args": ["run", "node", "dist/index.js"]
    }
  }
}
```

**OR** run the server locally and connect via Railway tunnel:

```bash
railway link
railway shell
node dist/index.js
```

## Health Check Endpoint

The server includes a health check endpoint for Railway:

- **GET /** - Health check
- **GET /health** - Health check

Returns:
```json
{
  "status": "ok",
  "service": "ig-mcp-server",
  "transport": "stdio",
  "note": "MCP server communicates via stdin/stdout, not HTTP"
}
```

## Troubleshooting

### Port Already in Use

If you get a port conflict:
1. Check Railway's port settings
2. Set `PORT` environment variable to a different port
3. Railway will automatically map it

### Service Not Starting

1. Check Railway logs for errors
2. Verify all required environment variables are set
3. Check that the Dockerfile builds correctly

### Cannot Connect from Agent

Remember: MCP servers don't connect via HTTP. You need to:
1. Run the server locally, OR
2. Use SSH/tunnel to execute the server remotely, OR
3. Use Railway CLI to run commands

The agent connects via stdio, not HTTP!

## Alternative: HTTP-Based MCP Server (Future)

If you want HTTP-based access, you would need to:
1. Implement an HTTP/SSE transport layer
2. Expose actual HTTP endpoints
3. Handle authentication via HTTP headers
4. This is NOT currently implemented

The current implementation is stdio-based, which is the standard for MCP servers.

## Summary

- **Port 3000**: Used for health checks only, NOT for MCP communication
- **MCP Communication**: Via stdio (stdin/stdout), requires local execution or SSH/tunnel
- **Railway**: Keeps the service running and handles health checks
- **Agent Connection**: Local MCP client connects via stdio, not HTTP

