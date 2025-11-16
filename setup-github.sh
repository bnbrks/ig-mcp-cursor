#!/bin/bash

# Script to create GitHub repository and push code
# Requires: GitHub CLI (gh) - install with: brew install gh

echo "🚀 Setting up GitHub repository..."

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo ""
    echo "Please install it with:"
    echo "  brew install gh"
    echo ""
    echo "Then authenticate with:"
    echo "  gh auth login"
    echo ""
    echo "Or manually create the repository at: https://github.com/new"
    echo "Then run the commands from PUSH_COMMANDS.md"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "🔐 Authenticating with GitHub..."
    gh auth login
fi

# Check if remote already exists
if git remote | grep -q origin; then
    echo "⚠️  Remote 'origin' already exists:"
    git remote -v
    echo ""
    read -p "Do you want to push to existing remote? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git push -u origin main
        exit 0
    fi
fi

# Create repository and push
echo "📦 Creating GitHub repository..."
gh repo create ig-mcp-server --public --source=. --remote=origin --push

echo ""
echo "✅ Repository created and code pushed to GitHub!"
echo "🌐 View your repository at: https://github.com/$(gh api user | grep -o '"login":"[^"]*' | cut -d'"' -f4)/ig-mcp-server"

