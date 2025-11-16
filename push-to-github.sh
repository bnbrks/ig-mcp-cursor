#!/bin/bash

# Script to push IG MCP Server to GitHub
# Run this after installing Xcode Command Line Tools

set -e

echo "🚀 Setting up Git repository..."

# Initialize git if not already initialized
if [ ! -d .git ]; then
    git init
    echo "✅ Git repository initialized"
else
    echo "✅ Git repository already initialized"
fi

# Add all files
git add .

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo "⚠️  No changes to commit"
else
    # Create initial commit
    git commit -m "Initial commit: IG MCP Server
    
    - Full IG.com API integration via MCP
    - Authentication with session management
    - Trading operations (place orders, manage positions)
    - Market data and historical prices
    - Account management
    - Watchlist support
    - Generic API caller for flexible endpoint access
    - Railway deployment ready
    - Full TypeScript implementation"
    
    echo "✅ Changes committed"
fi

# Check if remote exists
if git remote | grep -q origin; then
    echo "✅ Remote 'origin' already exists"
    echo ""
    echo "To push, run:"
    echo "  git push -u origin main"
else
    echo ""
    echo "📝 Next steps:"
    echo ""
    echo "1. Create a repository on GitHub:"
    echo "   https://github.com/new"
    echo ""
    echo "2. Then run one of these:"
    echo ""
    echo "   If you have GitHub CLI installed:"
    echo "   gh repo create ig-mcp-server --public --source=. --remote=origin --push"
    echo ""
    echo "   Or manually:"
    echo "   git remote add origin https://github.com/YOUR_USERNAME/ig-mcp-server.git"
    echo "   git branch -M main"
    echo "   git push -u origin main"
    echo ""
fi

