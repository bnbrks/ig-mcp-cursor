#!/bin/bash

# Place FTSE Daily order at market, £0.01 per point
# Usage: ./place-ftse-order.sh [ACCOUNT_ID] [DIRECTION] [SIZE]
# Example: ./place-ftse-order.sh ABC123 BUY 0.01

MCP_URL="https://ig-mcp-cursor-production.up.railway.app/mcp"
ACCOUNT_ID="${1:-}"
DIRECTION="${2:-BUY}"
SIZE="${3:-0.01}"

if [ -z "$ACCOUNT_ID" ]; then
  echo "Usage: $0 ACCOUNT_ID [DIRECTION] [SIZE]"
  echo "Example: $0 ABC123 BUY 0.01"
  echo ""
  echo "First, get your account ID:"
  echo "  curl -X POST $MCP_URL -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"ig_get_accounts\",\"arguments\":{}}}'"
  exit 1
fi

echo "Placing FTSE Daily order..."
echo "  Account ID: $ACCOUNT_ID"
echo "  Direction: $DIRECTION"
echo "  Size: £$SIZE per point"
echo "  Order Type: MARKET"
echo ""

RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"ig_place_order\",
      \"arguments\": {
        \"epic\": \"IX.D.FTSE.DAILY.IP\",
        \"direction\": \"$DIRECTION\",
        \"size\": $SIZE,
        \"orderType\": \"MARKET\",
        \"accountId\": \"$ACCOUNT_ID\"
      }
    }
  }")

echo "$RESPONSE" | jq '.'

# Check if order was successful
IS_ERROR=$(echo "$RESPONSE" | jq -r '.result.isError // false')

if [ "$IS_ERROR" = "true" ]; then
  echo ""
  echo "❌ Order failed!"
  exit 1
else
  echo ""
  echo "✅ Order placed successfully!"
  
  # Extract deal reference if available
  DEAL_REF=$(echo "$RESPONSE" | jq -r '.result.content[0].text' | jq -r '.data.dealReference // .data.dealId // "N/A"')
  echo "Deal Reference: $DEAL_REF"
fi

