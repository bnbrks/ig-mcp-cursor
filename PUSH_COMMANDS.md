# Commands to Push to GitHub

After creating the repository on GitHub, run these commands:

Replace `YOUR_USERNAME` with your actual GitHub username.

```bash
git remote add origin https://github.com/YOUR_USERNAME/ig-mcp-server.git
git branch -M main
git push -u origin main
```

If you used SSH instead, use:
```bash
git remote add origin git@github.com:YOUR_USERNAME/ig-mcp-server.git
git branch -M main
git push -u origin main
```

