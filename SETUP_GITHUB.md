# GitHub Setup Instructions

## Prerequisites

You need to have Git installed. If you see an error about developer tools, you need to install Xcode Command Line Tools first:

```bash
xcode-select --install
```

This will open a dialog to install the tools. Follow the prompts.

## Push to GitHub

### Option 1: Using GitHub CLI (Recommended)

If you have GitHub CLI installed:

```bash
# Install GitHub CLI if needed
brew install gh

# Authenticate with GitHub
gh auth login

# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: IG MCP Server"

# Create repository on GitHub and push
gh repo create ig-mcp-server --public --source=. --remote=origin --push
```

### Option 2: Manual GitHub Setup

1. **Initialize Git** (after installing developer tools):
   ```bash
   git init
   ```

2. **Add all files**:
   ```bash
   git add .
   ```

3. **Create initial commit**:
   ```bash
   git commit -m "Initial commit: IG MCP Server"
   ```

4. **Create repository on GitHub**:
   - Go to https://github.com/new
   - Repository name: `ig-mcp-server`
   - Choose public or private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
   - Click "Create repository"

5. **Add remote and push**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/ig-mcp-server.git
   git branch -M main
   git push -u origin main
   ```

   Replace `YOUR_USERNAME` with your GitHub username.

### Option 3: Quick Setup Script

Run this script after installing developer tools:

```bash
#!/bin/bash
git init
git add .
git commit -m "Initial commit: IG MCP Server"
echo "✅ Repository initialized and committed"
echo ""
echo "Next steps:"
echo "1. Create a repository on GitHub (https://github.com/new)"
echo "2. Then run:"
echo "   git remote add origin https://github.com/YOUR_USERNAME/ig-mcp-server.git"
echo "   git branch -M main"
echo "   git push -u origin main"
```

## After Pushing

Once your code is on GitHub, you can:

1. **Deploy to Railway**:
   - Connect your GitHub repository in Railway
   - Set environment variables (IG_API_KEY, IG_USERNAME, IG_PASSWORD)
   - Deploy automatically

2. **Share with others**: Your repository is now publicly available!

3. **Continue development**: Push future changes with:
   ```bash
   git add .
   git commit -m "Your commit message"
   git push
   ```

