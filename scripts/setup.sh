#!/bin/bash

echo "🚀 Yestr Face Setup Script"
echo "========================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16 or higher."
    exit 1
fi

echo "✅ Node.js $(node --version) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

echo "✅ npm $(npm --version) detected"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Check if wrangler is installed globally
if ! command -v wrangler &> /dev/null; then
    echo ""
    echo "📦 Installing Wrangler CLI globally..."
    npm install -g wrangler
fi

echo "✅ Wrangler $(wrangler --version) installed"

# Login to Cloudflare
echo ""
echo "🔐 Logging in to Cloudflare..."
echo "A browser window will open. Please authorize Wrangler."
wrangler login

# Prompt for configuration
echo ""
echo "🔧 Configuration"
echo "================"
echo ""
echo "Please have the following information ready:"
echo "1. Your Cloudflare Account ID"
echo "2. Your KV Namespace ID"
echo "3. R2 Access Key ID (optional - for advanced features)"
echo "4. R2 Secret Access Key (optional - for advanced features)"
echo ""

read -p "Enter your Cloudflare Account ID: " ACCOUNT_ID
read -p "Enter your KV Namespace ID: " KV_NAMESPACE_ID

# Update wrangler.toml
echo ""
echo "📝 Updating wrangler.toml..."
sed -i.bak "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" wrangler.toml
sed -i.bak "s/YOUR_KV_NAMESPACE_ID/$KV_NAMESPACE_ID/g" wrangler.toml
rm wrangler.toml.bak

echo "✅ Configuration updated"

# Set up secrets
echo ""
echo "🔒 Setting up secrets (optional)..."
echo "Press Enter to skip any secret you don't want to set."
echo ""

echo "R2 Access Key ID (press Enter to skip):"
read -s R2_ACCESS_KEY_ID
if [ ! -z "$R2_ACCESS_KEY_ID" ]; then
    echo "$R2_ACCESS_KEY_ID" | wrangler secret put R2_ACCESS_KEY_ID
fi

echo "R2 Secret Access Key (press Enter to skip):"
read -s R2_SECRET_ACCESS_KEY
if [ ! -z "$R2_SECRET_ACCESS_KEY" ]; then
    echo "$R2_SECRET_ACCESS_KEY" | wrangler secret put R2_SECRET_ACCESS_KEY
fi

echo "Allowed Origins (e.g., https://yestr.app,http://localhost:3000):"
read ALLOWED_ORIGINS
if [ ! -z "$ALLOWED_ORIGINS" ]; then
    echo "$ALLOWED_ORIGINS" | wrangler secret put ALLOWED_ORIGINS
fi

# Ready to deploy
echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 Ready to deploy. Run the following command:"
echo "   npm run deploy"
echo ""
echo "After deployment, your worker will be available at:"
echo "https://yestr-face.<your-subdomain>.workers.dev"
echo ""
echo "Test it with:"
echo "curl https://yestr-face.<your-subdomain>.workers.dev/health"