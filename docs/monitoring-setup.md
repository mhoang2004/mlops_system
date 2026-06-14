# Monitoring Setup — Hướng dẫn cài đặt các services

Để một server (compute node) có thể được theo dõi bởi MLOps platform này, bạn cần cài và chạy các exporter sau **trực tiếp trên máy đó**. Platform sẽ scrape metrics từ các HTTP endpoints của các exporter này.

---

## Tổng quan các services

| Service | Docker Image | Port mặc định | Loại máy | Metrics |
|---------|-------------|----------------|-----------|---------|
| **node-exporter** | `prom/node-exporter` | `9100` | Tất cả | CPU, RAM, Disk, Network |
| **cAdvisor** | `gcr.io/cadvisor/cadvisor` | `8080` | Tất cả | Container CPU/RAM |
| **DCGM Exporter** | `nvcr.io/nvidia/k8s/dcgm-exporter` | `9400` | GPU only | GPU util, VRAM, Temp, Power |

---

## 1. node-exporter (bắt buộc — mọi máy)

Cung cấp metrics hệ thống: CPU load, RAM, Disk, Network.

```bash
docker run -d \
  --name=node-exporter \
  --restart=unless-stopped \
  --net="host" \
  --pid="host" \
  -v "/:/host:ro,rslave" \
  prom/node-exporter:latest \
  --path.rootfs=/host
```

**Lưu ý:**
- `--net="host"` bắt buộc để node-exporter nhìn thấy đúng network interfaces của host.
- `--pid="host"` cần thiết để đọc process metrics của host.
- Chạy xong, kiểm tra tại: `http://<server-ip>:9100/metrics`

**Xác nhận hoạt động:**
```bash
curl -s http://localhost:9100/metrics | grep node_load1
```

---

## 2. cAdvisor (khuyến nghị — mọi máy có Docker)

Cung cấp metrics per-container: CPU usage, memory usage, memory limit.

```bash
docker run -d \
  --name=cadvisor \
  --restart=unless-stopped \
  --volume=/:/rootfs:ro \
  --volume=/var/run:/var/run:ro \
  --volume=/sys:/sys:ro \
  --volume=/var/lib/docker/:/var/lib/docker:ro \
  --volume=/dev/disk/:/dev/disk:ro \
  --publish=8080:8080 \
  --privileged \
  --device=/dev/kmsg \
  gcr.io/cadvisor/cadvisor:latest
```

**Lưu ý:**
- `--privileged` cần thiết để cAdvisor truy cập cgroup và kernel metrics.
- Kiểm tra tại: `http://<server-ip>:8080/metrics`
- Metrics container chỉ hiển thị khi bạn click "Metrics" trong UI và truyền `include_containers=true`.

---

## 3. DCGM Exporter (bắt buộc cho máy có GPU NVIDIA)

Cung cấp metrics GPU: utilization, VRAM used/free, temperature, power, clock speeds.

### Yêu cầu trước khi cài

**NVIDIA Container Toolkit** phải được cài trên host:

```bash
# Ubuntu / Debian
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Chạy DCGM Exporter

```bash
docker run -d \
  --name=dcgm-exporter \
  --restart=unless-stopped \
  --gpus all \
  --cap-add SYS_ADMIN \
  -p 9400:9400 \
  nvcr.io/nvidia/k8s/dcgm-exporter:latest
```

**Kiểm tra:**
```bash
curl -s http://localhost:9400/metrics | grep DCGM_FI_DEV_GPU_UTIL
```

**Output mẫu:**
```
DCGM_FI_DEV_GPU_UTIL{gpu="0",modelName="NVIDIA GeForce RTX 4090",...} 45
DCGM_FI_DEV_FB_USED{gpu="0",...} 8192
DCGM_FI_DEV_GPU_TEMP{gpu="0",...} 72
```

---

## Docker Compose (triển khai nhanh)

Tạo file `docker-compose.monitoring.yml` trên máy cần monitor:

```yaml
services:

  node-exporter:
    image: prom/node-exporter:latest
    restart: unless-stopped
    network_mode: host
    pid: host
    volumes:
      - /:/host:ro,rslave
    command:
      - --path.rootfs=/host
    # Port: 9100

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    restart: unless-stopped
    privileged: true
    devices:
      - /dev/kmsg
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    ports:
      - "8080:8080"
    # Port: 8080

  # --- Chỉ cho máy GPU: uncomment block dưới ---
  # dcgm-exporter:
  #   image: nvcr.io/nvidia/k8s/dcgm-exporter:latest
  #   restart: unless-stopped
  #   deploy:
  #     resources:
  #       reservations:
  #         devices:
  #           - driver: nvidia
  #             count: all
  #             capabilities: [gpu]
  #   cap_add:
  #     - SYS_ADMIN
  #   ports:
  #     - "9400:9400"
  #   # Port: 9400
```

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

---

## Đăng ký server vào hệ thống

Sau khi các exporter đã chạy, vào UI → **Servers** → **Thêm Server**:

| Field | Giá trị |
|-------|---------|
| Name | Tên tuỳ chọn, ví dụ `gpu-node-01` |
| Host / IP | IP của máy, ví dụ `192.168.1.100` |
| Node Exporter Port | `9100` (mặc định) |
| cAdvisor Port | `8080` (mặc định) |
| DCGM Exporter Port | `9400` nếu là GPU machine, để trống nếu không |
| GPU Count | Số lượng GPU (0 nếu CPU-only) |
| GPU Type | Model GPU, ví dụ `RTX 4090` |

Sau khi đăng ký, bấm **Ping** để kiểm tra kết nối. Nếu server ONLINE, platform sẽ tự động lấy metrics và hiển thị CPU load, RAM, và VRAM (nếu có GPU) trực tiếp trên card.

---

## Firewall / Network

Đảm bảo các port dưới đây được mở từ phía MLOps API server đến compute node:

| Port | Service |
|------|---------|
| `9100` | node-exporter |
| `8080` | cAdvisor |
| `9400` | DCGM Exporter (GPU only) |

Nếu dùng `ufw`:
```bash
# Cho phép MLOps API server (thay 10.0.0.5 bằng IP thực)
sudo ufw allow from 10.0.0.5 to any port 9100
sudo ufw allow from 10.0.0.5 to any port 8080
sudo ufw allow from 10.0.0.5 to any port 9400
```

---

## Metrics được thu thập

### CPU (node-exporter)
- Core count
- Load average 1m / 5m / 15m
- Load % (normalized by core count — proxy cho CPU usage)

### RAM (node-exporter)
- Total / Used / Free bytes
- Usage %

### Disk (node-exporter)
- Per mountpoint: Total / Used / Free bytes, Usage %

### Network (node-exporter)
- Total bytes received / transmitted (tất cả interfaces, trừ loopback)

### GPU (DCGM Exporter)
- Utilization %
- VRAM used / free / total (MB) + Usage %
- Temperature (°C)
- Power (W)
- SM Clock / Memory Clock (MHz)
- PCIe RX/TX throughput (KB/s)

### Containers (cAdvisor — on-demand)
- Per-container memory usage và limit
- Per-container CPU seconds total
