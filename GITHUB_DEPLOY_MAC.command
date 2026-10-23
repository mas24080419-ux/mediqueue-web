#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
echo "MediQueue Website — Upload GitHub"
echo "Truoc tien tao repository moi tai https://github.com/new, ten: mediqueue-web"
read -r -p "Dán URL repository vừa tạo (https://github.com/USERNAME/mediqueue-web): " repo
if [[ ! "$repo" =~ ^https://github\.com/[A-Za-z0-9-]+/[A-Za-z0-9_.-]+/?$ ]]; then
  echo "URL GitHub không hợp lệ" >&2
  exit 1
fi
repo="${repo%/}"
if [[ ! -d .git ]]; then git init; fi
git branch -M main
git add index.html styles.css app.js supabase-client.js config.example.js assets .github .nojekyll .gitignore README.md GITHUB_DEPLOY_MAC.command tests
if git diff --cached --quiet; then echo "Không có thay đổi mới"; else
  git -c user.name="MediQueue Developer" -c user.email="mediqueue-deploy@users.noreply.github.com" commit -m "Launch MediQueue responsive web demo"
fi
if git remote get-url origin >/dev/null 2>&1; then git remote set-url origin "$repo.git"; else git remote add origin "$repo.git"; fi
echo "Đang push lên $repo..."
git push -u origin main
printf '\nĐã push mã nguồn. Bật GitHub Pages tại: %s/settings/pages\n' "$repo"
