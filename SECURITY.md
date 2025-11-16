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

### 1. Environment-Only Credentials

Enable strict mode where credentials can only be set via environment variables:

```bash
export REQUIRE_ENV_CREDENTIALS=true
export IG_API_KEY=your_api_key
export IG_USERNAME=your_username
export IG_PASSWORD=your_password
```

When enabled, the `ig_login` tool will reject credentials passed directly and only use environment variables.

### 2. MCP Server API Key

Add an additional layer of security by requiring an API key to access the MCP server:

```bash
export MCP_SERVER_API_KEY=your_secure_random_key_here
```

When set, all tool calls must include this API key. You can generate a secure key with:

```bash
openssl rand -hex 32
```

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

4. **Enable Private Deployments** (if available):
   - Use Railway's private networking features
   - Restrict access to specific IPs/networks if possible

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

- [ ] All credentials stored as environment variables
- [ ] `.env` file is in `.gitignore`
- [ ] `REQUIRE_ENV_CREDENTIALS=true` for production
- [ ] `MCP_SERVER_API_KEY` set for public deployments
- [ ] Railway secrets configured (not in code)
- [ ] Different credentials for dev/prod
- [ ] Regular credential rotation
- [ ] Monitor access logs

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

