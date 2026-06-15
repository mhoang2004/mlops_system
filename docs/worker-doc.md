git clone <repo-url> mlops && cd mlops

cp .env.worker.example .env.worker
# Sửa .env.worker: điền Tailscale IP máy 1 (100.X.X.X) và IP máy 2 (100.Y.Y.Y)
# Lấy IP: tailscale ip -4

docker compose -f docker-compose.worker.yml up --build -d
docker compose -f docker-compose.worker.yml logs -f training-worker

Bây giờ trên máy GPU (máy 2), chỉ cần thêm env vars vào file .env hoặc docker run:
WORKER_NAME=gpu-server-2
WORKER_HOST=100.x.x.x          # Tailscale IP của máy GPU
NVIDIA_VISIBLE_DEVICES=all
GPU_COUNT=1                     # hoặc số GPU thực tế
GPU_TYPE=RTX 4090               # tên GPU (tùy chọn)
DCGM_EXPORTER_PORT=9400         # port dcgm-exporter đang chạy trên máy GPU
NODE_EXPORTER_PORT=9100         # nếu có node-exporter
CADVISOR_PORT=8080              # nếu có cAdvisor
