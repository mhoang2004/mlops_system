git clone <repo-url> mlops && cd mlops

cp .env.worker.example .env.worker
# Sửa .env.worker: điền Tailscale IP máy 1 (100.X.X.X) và IP máy 2 (100.Y.Y.Y)
# Lấy IP: tailscale ip -4

docker compose -f docker-compose.worker.yml up --build -d
docker compose -f docker-compose.worker.yml logs -f training-worker
