# Security Guide for IG MCP Server

This document outlines security best practices for deploying and using the IG MCP Server.

## ⚠️ Security Considerations

### Credentials Storage

**NEVER** store or commit credentials to version control. Always use environment variables or secure secret management.

### Deployment Security

For **publicly accessible** MCP servers (e.g., deployed on Railway), you should:

1. **Use Environment Variables Only**: Set `REQUIRE_ENV_CREDENTIALS=true` to prevent credentials from being passed via tool calls
2. **Add MCP Server API Key**: Set `MCP_SERVER_API_KEY` to restrict access to the server
3. **Use Railway Secrets**: Store all sensitive values as Railway environment variables (not in code)

## 🔒 Security Features

### 1. Endpoint Authentication (CRITICAL for Public Deployments)

**⚠️ IMPORTANT**: For publicly accessible servers (Railway, etc.), you MUST set `MCP_SERVER_API_KEY` to prevent unauthorized access to your IG account.

```bash
export MCP_SERVER_API_KEY=your_secure_random_key_here
export REQUIRE_AUTHENTICATION=true  # Default: true
```

**How it works:**
- Users must call `mcp_authenticate` tool first with the API key
- Only authenticated connections can use IG API tools
- Prevents unauthorized access to your IG account

**Generate a secure key:**
```bash
openssl rand -hex 32
```

**In ChatGPT/MCP client:**
1. First call: `mcp_authenticate` with `apiKey: "your_MCP_SERVER_API_KEY"`
2. Then use other tools like `ig_login`, `ig_get_accounts`, etc.

### 2. Environment-Only Credentials

Enable strict mode where credentials can only be set via environment variables:

```bash
export REQUIRE_ENV_CREDENTIALS=true
export IG_API_KEY=your_api_key
export IG_USERNAME=your_username
export IG_PASSWORD=your_password
```

When enabled, the `ig_login` tool will reject credentials passed directly and only use environment variables.

### 3. Network-Level Security (Railway)

**MCP servers typically use stdio (standard input/output)**, which means they're accessed via the local machine, not HTTP. However, if your deployment exposes endpoints:

1. **Private Networking**: Use Railway Private Networking to restrict access
2. **IP Whitelisting**: Configure Railway to only accept connections from specific IPs
3. **VPN Access**: Connect to Railway through a VPN
4. **Service Isolation**: Deploy in a private network segment

**For stdio-based MCP servers** (most common):
- The server runs locally and communicates via stdin/stdout
- Network security is handled by the host machine
- **Still requires `MCP_SERVER_API_KEY`** to prevent unauthorized tool usage

**For HTTP-based MCP servers** (if implemented):
- Add bearer token authentication
- Use HTTPS only
- Implement rate limiting
- Add CORS restrictions

### 3. Session Isolation

- Sessions are stored per connection ID in memory
- Sessions are not shared between connections
- Sessions are cleared when the server restarts

## 🚀 Railway Deployment Security

### Recommended Environment Variables

Set these in your Railway project settings:

1. **Required IG Credentials**:
   ```
   IG_API_KEY=your_ig_api_key
   IG_USERNAME=your_ig_username
   IG_PASSWORD=your_ig_password
   ```

2. **Security Settings**:
   ```
   REQUIRE_ENV_CREDENTIALS=true
   MCP_SERVER_API_KEY=your_secure_random_key
   ```

3. **Optional**:
   ```
   IG_API_URL=https://api.ig.com/gateway/deal
   ```

### Railway Setup Steps

1. **Create Railway Project**
2. **Connect GitHub Repository**
3. **Set Environment Variables** (in Railway dashboard):
   - Go to Variables tab
   - Add each variable as a secret
   - Never commit these to your repository
   
   **REQUIRED for public deployments:**
   ```
   MCP_SERVER_API_KEY=your_secure_random_key  # Generate with: openssl rand -hex 32
   REQUIRE_AUTHENTICATION=true
   REQUIRE_ENV_CREDENTIALS=true
   IG_API_KEY=your_ig_api_key
   IG_USERNAME=your_ig_username
   IG_PASSWORD=your_ig_password
   ```

4. **Network Security** (Recommended):
   - Use Railway Private Networking if available
   - Configure IP whitelisting if possible
   - Use Railway's built-in authentication features

5. **Additional Railway Security**:
   - Enable Railway's firewall rules
   - Use Railway's authentication proxy
   - Configure service-to-service authentication

## 🔐 Local Development Security

For local development:

1. **Use `.env` file** (gitignored):
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. **Never commit `.env`** to version control

3. **Use different credentials** for development vs production

## 📋 Security Checklist

### Required for Public Deployments:
- [ ] `MCP_SERVER_API_KEY` set (generate with `openssl rand -hex 32`)
- [ ] `REQUIRE_AUTHENTICATION=true` (default, prevents unauthorized access)
- [ ] `REQUIRE_ENV_CREDENTIALS=true` (prevents credential leakage)
- [ ] All IG credentials stored as Railway secrets (not in code)
- [ ] Test authentication: Call `mcp_authenticate` before other tools

### Recommended:
- [ ] `.env` file is in `.gitignore`
- [ ] Different credentials for dev/prod
- [ ] Railway private networking enabled (if available)
- [ ] IP whitelisting configured (if possible)
- [ ] Regular credential rotation
- [ ] Monitor access logs
- [ ] Set up alerts for failed authentication attempts

## 🛡️ Additional Security Measures

### Network-Level Security

- Use VPN or private network for MCP server access
- Restrict Railway service to specific IPs if possible
- Use Railway's authentication features

### Credential Rotation

- Rotate IG API keys regularly
- Rotate MCP server API keys periodically
- Update environment variables immediately after rotation

### Monitoring

- Monitor Railway logs for unauthorized access attempts
- Set up alerts for authentication failures
- Review access patterns regularly

### Two-Factor Authentication

If your IG account has 2FA enabled:
- Append the 6-digit code to your password: `password123456`
- Never store the 2FA code in environment variables (generate per session)

## 🚨 Security Incidents

If credentials are compromised:

1. **Immediately rotate** all affected credentials
2. **Update environment variables** in Railway
3. **Review access logs** for unauthorized activity
4. **Revoke and regenerate** MCP server API keys if applicable
5. **Review and update** security policies

## 📚 Best Practices Summary

1. ✅ **Use Environment Variables**: Never hardcode credentials
2. ✅ **Enable Strict Mode**: Use `REQUIRE_ENV_CREDENTIALS=true` in production
3. ✅ **Add API Key Protection**: Use `MCP_SERVER_API_KEY` for public servers
4. ✅ **Use Secret Management**: Railway secrets, not code
5. ✅ **Isolate Sessions**: Each connection has its own session
6. ✅ **Rotate Regularly**: Change credentials periodically
7. ✅ **Monitor Access**: Watch for suspicious activity
8. ✅ **Keep Private**: Don't expose server publicly unless necessary

## 🔗 Resources

- [Railway Environment Variables](https://docs.railway.app/develop/variables)
- [IG.com API Security](https://labs.ig.com)
- [MCP Protocol Security](https://modelcontextprotocol.io)

