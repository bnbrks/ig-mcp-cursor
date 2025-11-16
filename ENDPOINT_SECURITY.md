# Endpoint Security Guide

This guide explains how to secure your MCP server endpoints to prevent unauthorized access to your IG account.

## 🚨 Critical Security Issue

**If your server is publicly accessible** (deployed on Railway, cloud, etc.), **anyone who can connect to it could potentially access your IG account** unless you implement proper authentication.

## 🔐 Solution: MCP Server API Key Authentication

### Step 1: Generate API Key

Generate a secure random API key:

```bash
openssl rand -hex 32
```

This will output something like:
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### Step 2: Set Environment Variable

In Railway (or your deployment platform), set:

```bash
MCP_SERVER_API_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
REQUIRE_AUTHENTICATION=true
```

### Step 3: Authenticate Before Use

When using the MCP server, **always authenticate first**:

**In ChatGPT/MCP Client:**

1. **First call** - Authenticate:
   ```
   Tool: mcp_authenticate
   Arguments: {
     "apiKey": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
   }
   ```

2. **Then** you can use other tools:
   ```
   Tool: ig_login
   Tool: ig_get_accounts
   Tool: ig_place_order
   etc.
   ```

## 🔒 How It Works

1. **Server checks authentication** before allowing any IG API tool calls
2. **Connection is tracked** - once authenticated, that connection can use tools
3. **Invalid API key** - requests are rejected with an error
4. **No API key set** - server allows all connections (NOT recommended for production)

## ⚠️ Security Levels

### Level 1: No Protection (DANGEROUS for public deployments)
```bash
# No MCP_SERVER_API_KEY set
# Anyone who can connect can use your IG account
```

### Level 2: API Key Required (RECOMMENDED)
```bash
MCP_SERVER_API_KEY=your_key_here
REQUIRE_AUTHENTICATION=true  # Default
# Users must authenticate before using tools
```

### Level 3: Full Security (BEST)
```bash
MCP_SERVER_API_KEY=your_key_here
REQUIRE_AUTHENTICATION=true
REQUIRE_ENV_CREDENTIALS=true
# API key required + credentials only via environment
```

## 🌐 Network-Level Security (Additional Protection)

### Railway Private Networking

If Railway supports private networking:
- Deploy in a private network
- Only allow connections from specific sources
- Use Railway's service-to-service authentication

### IP Whitelisting

If possible, configure Railway to only accept connections from:
- Your home IP address
- Your office IP address
- Specific VPN endpoints

### VPN Access

- Connect to Railway through a VPN
- Restrict Railway access to VPN users only

## 📊 Security Comparison

| Configuration | Public Access Risk | Protection Level |
|--------------|-------------------|------------------|
| No API key | ⚠️ HIGH | ❌ None |
| API key only | ⚡ MEDIUM | ✅ Basic |
| API key + Env credentials | ✅ LOW | ✅✅ Strong |
| API key + Env + Network | ✅✅ VERY LOW | ✅✅✅ Excellent |

## 🛡️ Defense in Depth

Use multiple layers:

1. **Application Layer**: MCP_SERVER_API_KEY (REQUIRED)
2. **Credentials Layer**: REQUIRE_ENV_CREDENTIALS=true
3. **Network Layer**: Private networking, IP whitelisting
4. **Monitoring**: Log authentication attempts, alert on failures

## 🚀 Quick Start for Railway

1. **Generate API Key**:
   ```bash
   openssl rand -hex 32
   ```

2. **Set in Railway**:
   - Go to your Railway project
   - Settings → Variables
   - Add: `MCP_SERVER_API_KEY` = `[your generated key]`
   - Add: `REQUIRE_AUTHENTICATION` = `true`
   - Add: `REQUIRE_ENV_CREDENTIALS` = `true`

3. **Deploy** - Server now requires authentication

4. **Use** - Always call `mcp_authenticate` first in your MCP client

## ❓ FAQ

**Q: What happens if I don't set MCP_SERVER_API_KEY?**
A: The server will accept all connections - anyone can use your IG account!

**Q: Can I change the API key?**
A: Yes, update the environment variable and redeploy. All existing connections will need to re-authenticate.

**Q: Is the API key stored securely?**
A: Store it as a Railway secret/environment variable, never in code or logs.

**Q: What if someone gets my API key?**
A: Rotate it immediately by generating a new one and updating the environment variable.

**Q: Do I need to authenticate every time?**
A: Authentication is per-connection. Each new MCP connection needs to authenticate once.

## 🔍 Testing Security

Test that authentication is working:

1. **Without API key** - Should fail:
   ```
   Tool: ig_get_accounts
   → Error: Unauthorized: Connection not authenticated
   ```

2. **With wrong API key** - Should fail:
   ```
   Tool: mcp_authenticate
   Arguments: { "apiKey": "wrong_key" }
   → Error: Authentication failed: Invalid API key
   ```

3. **With correct API key** - Should succeed:
   ```
   Tool: mcp_authenticate
   Arguments: { "apiKey": "correct_key" }
   → Success: Successfully authenticated
   
   Tool: ig_get_accounts
   → Success: Account data returned
   ```

## 📚 See Also

- [SECURITY.md](SECURITY.md) - Comprehensive security guide
- [README.md](README.md) - General documentation

