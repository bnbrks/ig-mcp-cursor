#!/bin/bash

# Test script to place a FTSE trade via MCP server
# Make sure your IG credentials are set in Railway environment variables

MCP_URL="https://ig-mcp-cursor-production.up.railway.app/mcp"

echo "Step 1: Logging in to IG API..."
LOGIN_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "ig_login",
      "arguments": {}
    }
  }')

echo "$LOGIN_RESPONSE" | jq '.'
echo ""

echo "Step 2: Getting accounts to find spread bet account..."
ACCOUNTS_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "ig_get_accounts",
      "arguments": {}
    }
  }')

echo "$ACCOUNTS_RESPONSE" | jq '.'
echo ""

# Extract spread bet account ID (you may need to adjust this based on your account structure)
SPREAD_BET_ACCOUNT=$(echo "$ACCOUNTS_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.data[] | select(.accountType == "SPREADBET" or .accountName | contains("Spread") or .accountName | contains("SB")) | .accountId' | head -1)

if [ -z "$SPREAD_BET_ACCOUNT" ] || [ "$SPREAD_BET_ACCOUNT" == "null" ]; then
  echo "Warning: Could not automatically find spread bet account. Please check the accounts response above and set SPREAD_BET_ACCOUNT manually."
  echo "Or use the first account ID from the response."
  SPREAD_BET_ACCOUNT="YOUR_SPREAD_BET_ACCOUNT_ID"
fi

echo "Using account ID: $SPREAD_BET_ACCOUNT"
echo ""

echo "Step 3: Searching for FTSE instrument..."
SEARCH_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "ig_search_instruments",
      "arguments": {
        "searchTerm": "FTSE"
      }
    }
  }')

echo "$SEARCH_RESPONSE" | jq '.'
echo ""

echo "Step 4: Placing order for FTSE 0.1 points at market on spread bet account..."
ORDER_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 4,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"ig_place_order\",
      \"arguments\": {
        \"epic\": \"IX.D.FTSE.IFM.IP\",
        \"direction\": \"BUY\",
        \"size\": 0.1,
        \"orderType\": \"MARKET\",
        \"accountId\": \"$SPREAD_BET_ACCOUNT\"
      }
    }
  }")

echo "$ORDER_RESPONSE" | jq '.'
echo ""

echo "Done! Check the order response above for the deal reference."

