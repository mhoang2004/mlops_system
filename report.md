ĐẶC TẢ HỆ THỐNG MLOPS

Đây là tài liệu đặc tả hệ thống MLOPs, đi kèm sơ đồ phân rã chức năng (BFD) bằng text và mô tả chi tiết tương tác của Tác nhân (Actor).

---

# TÀI LIỆU ĐẶC TẢ HỆ THỐNG MLOPS (PHÂN HỆ FINE-TUNE & MONITORING)

## 1. Sơ đồ phân rã chức năng (Business Function Decomposition - BFD)

Dưới đây là cấu trúc phân rã các tính năng của hệ thống MLOps từ mức tổng quát đến chi tiết:

```
HỆ THỐNG MLOPS
├── [F1] Quản lý & Tích hợp Trainer (Trainer Management)
│   ├── [F1.1] Đăng ký & Tích hợp Trainer cá nhân (Trainer Registry)
│   └── [F1.2] Quản lý Models
│   └── [F1.3] Quản lý Pre-trained Checkpoints
├── [F2] Quản lý Dữ liệu & Gán nhãn (Data Pipeline)
│   ├── [F2.1] Upload Dữ liệu (Hình ảnh) & Nhãn có sẵn
│   ├── [F2.2] Gán nhãn dữ liệu (Tích hợp CVAT)
│   └── [F2.3] Đồng bộ dữ liệu về Storage nội bộ (MinIO)
├── [F3] Quản lý Hạ tầng & Giám sát (Infrastructure & Monitoring)
│   ├── [F3.1] Tích hợp/ quản lý Servers
│   └── [F3.2] Monitoring hiệu năng từng server
└── [F4] Chu trình Huấn luyện & Đánh giá (Training & Evaluation Pipeline)
    ├── [F4.1] Khởi chạy Tiến trình Training (Fine-tuning Job)
    ├── [F4.2] Đánh giá mô hình (Evaluation Metrics)
    └── [F4.3] Trực quan hóa kết quả (Visualization - Loss, Accuracy,...)

```

---

## 2. Tác nhân (Actors) và Cách thức sử dụng chức năng

Hệ thống chủ yếu tương tác với 2 tác nhân chính:

1. **AI/ML Engineer (Kỹ sư ML):** Người trực tiếp cấu hình, upload, gán nhãn, cấu hình server và thực hiện train/evaluate mô hình.
2. **Infrastructure Engineer / Admin (Kỹ sư hạ tầng):** Cấu hình, kết nối các server compute vào hệ thống MLOps và giám sát tài nguyên phần cứng.

---

## 3. Đặc tả chi tiết chức năng & Luồng vận hành (Use-case Specification)

### 3.1. Nhóm chức năng 1: Fine-tune Model (Tích hợp trainer -> Chuẩn bị Data -> Train -> Eval)

#### Bước 1: Tích hợp Model cá nhân & Thêm Checkpoint

* **Mô tả:** AI Engineer đưa cấu trúc mã nguồn mô hình (custom architecture) của mình lên hệ thống MLOps để hệ thống hiểu được cách gọi hàm train/, chiến lược train, optimizer và loss func. Sau đó upload file trọng số (`.pt`, `.ckpt`, `.safetensors`...) làm nền tảng fine-tune.
* **Tác nhân thực hiện:** AI Engineer.
* **Cách thức sử dụng:**
1. AI Engineer vào mục **trainer/** -> Implement code train của họ.
2. Upload mã nguồn (kết nối qua Git)
3. Vào mục **Checkpoint Management** -> Upload file Pre-trained Checkpoint tương ứng với model vừa đăng ký lên hệ thống.

#### Bước 2: Quản lý Dữ liệu, Gán nhãn (CVAT) & Đồng bộ (MinIO)

* **Mô tả:** Chuẩn bị tập dữ liệu hình ảnh để sẵn sàng đưa vào huấn luyện.
* **Tác nhân thực hiện:** AI Engineer / Data Labeler.
* **Cách thức sử dụng:**
1. AI Engineer truy cập module **Data Management**, tạo một Dataset mới.
2. Upload file ảnh gốc và file nhãn (nếu có sẵn).
3. Nếu cần gán nhãn thêm hoặc sửa nhãn, hệ thống cung cấp nút điều hướng sang giao diện **CVAT**.
4. Thực hiện gán nhãn (Bounding box, Segmentation...) trên CVAT.
5. Sau khi hoàn thành trên CVAT, nhấn nút **"Sync to MinIO"**. Hệ thống MLOps sẽ tự động gom toàn bộ ảnh + file nhãn (format YOLO, COCO...) lưu trữ tập trung vào các Bucket chuyên biệt trên **MinIO Storage** để đảm bảo tốc độ đọc/ghi cao khi train.



#### Bước 3: Khởi chạy Huấn luyện (Training)

* **Mô tả:** Tiến hành kích hoạt tiến trình chạy fine-tune thực tế dựa trên data và checkpoint đã chuẩn bị.
* **Tác nhân thực hiện:** AI Engineer.
* **Cách thức sử dụng:**
1. Vào mục **Training Jobs** -> Chọn "Create New Job".
2. Chọn Model và Pre-trained Checkpoint mong muốn.
3. Chọn Dataset tương ứng từ MinIO.
4. Cấu hình Hyperparameters (Learning rate, Batch size, Epochs...).
5. Nhấn "Start Training". Hệ thống sẽ đóng gói code + checkpoint + data thành một Docker Container (hoặc Kubernetes Pod) để gửi đến Server được chọn ở Nhóm chức năng 2.



#### Bước 4: Đánh giá (Evaluate) & Trực quan hóa (Visualize)

* **Mô tả:** Theo dõi hiệu năng mô hình trong và sau quá trình huấn luyện để quyết định có deploy hay không.
* **Tác nhân thực hiện:** AI Engineer.
* **Cách thức sử dụng:**
1. Trong lúc Model đang train, AI Engineer vào tab **Visualization** (Tích hợp TensorBoard/MLflow).
2. Hệ thống hiển thị các biểu đồ trực quan theo thời gian thực (Real-time charts): *Loss curve, Accuracy, Precision, Recall, F1-Score*.
3. Khi kết thúc Train, hệ thống tự động chạy một script **Evaluate** trên tập dữ liệu Test/Validation độc lập và xuất ra file báo cáo: *Confusion Matrix, ROC Curve, và hiển thị một số hình ảnh predict mẫu* (Ảnh thực tế được mô hình vẽ bounding box kèm độ tự tin %) ngay trên UI để Engineer đánh giá trực quan chất lượng mô hình.



---

### 3.2. Nhóm chức năng 2: Quản lý Server và Monitoring

#### Bước 1: Quản lý & Chọn Server để Train

* **Mô tả:** Cho phép người dùng tối ưu hóa tài nguyên phần cứng, điều phối job train vào các máy có GPU phù hợp.
* **Tác nhân thực hiện:** AI Engineer (Người chọn), Infrastructure Admin (Người cấu hình hệ thống).
* **Cách thức sử dụng:**
1. Admin kết nối các Server vật lý hoặc Cloud Instance (Node) vào cụm tính toán của MLOps (K8s Cluster).
2. Khi AI Engineer tạo một *Training Job* (ở bước 3 của nhóm 1), tại mục **Compute Configuration**, hệ thống sẽ liệt kê danh sách các Server/Node đang rảnh.
3. AI Engineer có thể chủ động tích chọn: *Server A (Có 2 card RTX 4090)* hoặc *Server B (Có 1 card A100)* tùy thuộc vào độ lớn của Model và Dataset.



#### Bước 2: Monitoring (Giám sát tài nguyên)

* **Mô tả:** Theo dõi "sức khỏe" của toàn bộ hạ tầng phần cứng để tránh tình trạng quá nhiệt, tràn RAM, hoặc nghẽn mạng.
* **Tác nhân thực hiện:** AI Engineer & Infrastructure Admin.
* **Cách thức sử dụng:**
1. Cả 2 tác nhân truy cập vào tab **Infrastructure Monitoring** (Hệ thống thường tích hợp Grafana + Prometheus dưới nền).
2. **Giao diện hiển thị:**
* **GPU Metrics:** % Sử dụng (Utilization), Nhiệt độ (Temperature), VRAM đã tiêu thụ (ví dụ: 18GB/24GB).
* **System Metrics:** % CPU, RAM, Tốc độ đọc/ghi đĩa (Disk I/O) khi load data từ MinIO sang RAM.


3. Nếu một Server bị quá tải hoặc nhiệt độ GPU vượt ngưỡng an toàn, hệ thống sẽ gửi cảnh báo (Alert) và Engineer có thể chủ động tạm dừng (Pause) hoặc hủy (Kill) Job train đó để bảo vệ thiết bị.

