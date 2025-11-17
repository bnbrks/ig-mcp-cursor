#!/bin/bash

# Login script for IG MCP Server
# Usage: ./login.sh [MCP_SERVER_API_KEY]

MCP_URL="https://ig-mcp-cursor-production.up.railway.app/mcp"
MCP_API_KEY="${1:-}"

echo "=== IG MCP Server Login ==="
echo ""

# Step 1: Authenticate with MCP Server (if API key provided)
if [ -n "$MCP_API_KEY" ]; then
  echo "Step 1: Authenticating with MCP server..."
  MCP_AUTH_RESPONSE=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": 1,
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"mcp_authenticate\",
        \"arguments\": {
          \"apiKey\": \"$MCP_API_KEY\"
        }
      }
    }")
  
  echo "$MCP_AUTH_RESPONSE" | jq '.'
  
  # Check if authentication was successful
  AUTH_SUCCESS=$(echo "$MCP_AUTH_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.data.authenticated // false')
  
  if [ "$AUTH_SUCCESS" != "true" ]; then
    echo ""
    echo "❌ MCP server authentication failed!"
    echo "Response: $MCP_AUTH_RESPONSE"
    exit 1
  fi
  
  echo "✅ MCP server authentication successful!"
  echo ""
else
  echo "Step 1: Skipping MCP server authentication (no API key provided)"
  echo "   To authenticate with MCP server, run: ./login.sh YOUR_MCP_API_KEY"
  echo ""
fi

# Step 2: Authenticate with IG API
echo "Step 2: Authenticating with IG API..."
IG_LOGIN_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "ig_login",
      "arguments": {}
    }
  }')

echo "$IG_LOGIN_RESPONSE" | jq '.'

# Check if login was successful
LOGIN_SUCCESS=$(echo "$IG_LOGIN_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.data.authenticated // false')
IS_ERROR=$(echo "$IG_LOGIN_RESPONSE" | jq -r '.result.isError // false')

if [ "$IS_ERROR" = "true" ] || [ "$LOGIN_SUCCESS" != "true" ]; then
  echo ""
  echo "❌ IG API login failed!"
  echo ""
  echo "Make sure your IG credentials are set in Railway environment variables:"
  echo "  - IG_API_KEY"
  echo "  - IG_USERNAME"
  echo "  - IG_PASSWORD"
  echo ""
  echo "Or check the error message above for details."
  exit 1
fi

echo ""
echo "✅ IG API login successful!"
echo ""

# Extract account info
ACCOUNT_ID=$(echo "$IG_LOGIN_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.data.accountId // "N/A"')
ACCOUNT_TYPE=$(echo "$IG_LOGIN_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.data.accountType // "N/A"')

echo "Account ID: $ACCOUNT_ID"
echo "Account Type: $ACCOUNT_TYPE"
echo ""
echo "You are now authenticated and can use IG API tools!"

