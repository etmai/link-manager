# Link Manager VPS Deployment Script
# ----------------------------------
# This script bundles the local project and prepares it for the VPS.

$VPS_IP = "107.174.68.221"
$VPS_USER = "root"
$TARGET_DIR = "/var/www/link-manager"
$BUNDLE_NAME = "link-manager-deploy.tar.gz"

echo "[*] Preparing deployment bundle..."

# Create a temporary list of files to exclude
# Note: bsdtar on Windows uses --exclude
tar --exclude="node_modules" `
    --exclude="*.log" `
    --exclude=".git" `
    --exclude=".bolt" `
    --exclude="scratch" `
    --exclude=".env" `
    -czf $BUNDLE_NAME src public prisma package.json .env.production telegram-bot.js vps-script database.sqlite

echo "[*] Transferring bundle to VPS ($VPS_IP)..."
echo "[!] You may be prompted for the VPS password."

scp $BUNDLE_NAME ${VPS_USER}@${VPS_IP}:${TARGET_DIR}/

if ($LASTEXITCODE -eq 0) {
    echo "--------------------------------------------------------"
    echo "✅ TRANSFER SUCCESSFUL!"
    echo "--------------------------------------------------------"
    echo "[*] Now, please SSH into your VPS to complete the setup:"
    echo "    ssh ${VPS_USER}@${VPS_IP}"
    echo ""
    echo "[*] Once inside the VPS, run these commands:"
    echo "    cd ${TARGET_DIR}"
    echo "    tar -xzf ${BUNDLE_NAME}"
    echo "    cp .env.production .env"
    echo "    npm install --production"
    echo "    npx prisma generate"
    echo "    pm2 restart link-manager || pm2 start src/server.js --name 'link-manager'"
    echo "    pm2 save"
    echo "--------------------------------------------------------"
} else {
    echo "❌ Transfer failed. Please check your SSH connection."
}

# Cleanup
# Remove-Item $BUNDLE_NAME -ErrorAction SilentlyContinue
