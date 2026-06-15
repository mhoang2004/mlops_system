# Nền Tảng MLOps cho Huấn Luyện Thị Giác Máy Tính Phân Tán: Thiết Kế và Triển Khai

---

## Tóm Tắt

Nhu cầu ngày càng tăng về học máy trong các ứng dụng thị giác máy tính đã bộc lộ một khoảng trống quan trọng giữa nghiên cứu mô hình và triển khai thực tế: các nhà nghiên cứu thiếu hạ tầng nhẹ, tự lưu trữ, tích hợp đồng thời quản lý tập dữ liệu, điều phối huấn luyện phân tán, theo dõi thực nghiệm và quản lý vòng đời mô hình mà không phụ thuộc vào dịch vụ đám mây thương mại. Bài báo này trình bày một nền tảng MLOps đầy đủ được thiết kế để lấp đầy khoảng trống đó. Hệ thống tích hợp năm dịch vụ cốt lõi — kho metadata PostgreSQL, kho đối tượng MinIO, hàng đợi tác vụ Celery dựa trên Redis, backend REST FastAPI, và giao diện web React — thành một stack triển khai thống nhất. Các đóng góp chính bao gồm: (1) một lớp trừu tượng trainer dựa trên schema tự động sinh form cấu hình giao diện người dùng trực tiếp từ các model tham số Pydantic, cho phép đăng ký framework huấn luyện mới mà không cần thay đổi frontend; (2) cơ chế tự đăng ký server tại thời điểm khởi động, gán mỗi Celery worker một hàng đợi định tuyến riêng, đảm bảo thực nghiệm được điều phối đúng đến node tính toán mà người dùng chọn; (3) kiến trúc huấn luyện đa máy hỗ trợ các node không đồng nhất — bao gồm GPU server trên mạng từ xa — kết nối qua VPN overlay, với endpoint MinIO và URL callback API được giải quyết theo từng worker tại thời điểm phân phối tác vụ thay vì được mã hóa cứng lúc triển khai. Nền tảng hỗ trợ toàn bộ vòng đời thực nghiệm từ tải lên tập dữ liệu, nhập annotation, huấn luyện, đánh giá đến quản lý checkpoint. Các metric thực nghiệm được theo dõi theo từng epoch qua MLflow. Một triển khai thực tế nhắm đến phát hiện đối tượng kiểu YOLO được trình bày, với hệ thống plugin trainer hỗ trợ mở rộng sang các kiến trúc tùy ý trong tương lai. Công việc tương lai bao gồm tích hợp công cụ annotation qua CVAT và trực quan hóa metric theo epoch trong giao diện nền tảng.

---

## 1. Giới Thiệu

### 1.1 Động Lực

Các nhóm kỹ thuật học máy thường dành một phần không cân xứng thời gian cho hạ tầng thay vì cho mô hình. Một người thực hành đang huấn luyện mô hình phát hiện đối tượng phải: tải lên và phiên bản hóa ảnh huấn luyện, quản lý tệp annotation, chọn node tính toán, cấu hình siêu tham số, giám sát tiến trình huấn luyện, lấy checkpoint tốt nhất, và ghi lại cấu hình nào tạo ra kết quả nào. Không có công cụ chuyên dụng, các bước này được thực hiện thủ công — với script, thư mục dùng chung, và bảng tính — khiến thực nghiệm khó tái hiện và kết quả khó so sánh.

Các nền tảng MLOps thương mại (AWS SageMaker, Google Vertex AI, Azure ML) giải quyết vấn đề này nhưng lại mang theo chi phí, phụ thuộc nhà cung cấp, và lo ngại về nơi lưu trữ dữ liệu — những điều cấm kỵ với nhiều tổ chức, đặc biệt trong bối cảnh học thuật, y tế, và quốc phòng, nơi dữ liệu không thể rời khỏi hạ tầng nội bộ.

### 1.2 Khoảng Trống

Các giải pháp mã nguồn mở hiện có chỉ giải quyết từng phần của vấn đề. MLflow xuất sắc trong ghi nhật ký metric nhưng không quản lý tập dữ liệu hay phân phối tác vụ huấn luyện. Kubeflow cung cấp điều phối đầy đủ nhưng đòi hỏi chuyên môn Kubernetes và tài nguyên cluster đáng kể. Label Studio và CVAT xử lý annotation nhưng không có pipeline huấn luyện. Không có giải pháp nhẹ, tích hợp duy nhất nào bao gồm phiên bản hóa tập dữ liệu, phân phối tác vụ đến phần cứng không đồng nhất, theo dõi thực nghiệm, và giao diện web dễ sử dụng trong một footprint vận hành hợp lý.

### 1.3 Đóng Góp

Công trình này có những đóng góp sau:

- **Hệ thống plugin trainer dựa trên schema**: các trainer đăng ký schema tham số Pydantic khi khởi động; API lưu trữ chúng và frontend tự động render form cấu hình, không cần thay đổi frontend để thêm trainer mới.
- **Định tuyến hàng đợi theo worker**: mỗi Celery worker truy vấn API khi khởi động để lấy ID cơ sở dữ liệu của mình và đăng ký hàng đợi có tên riêng (`server_{id}`), cho phép API định tuyến tác vụ đúng đến node tính toán mà người dùng chọn.
- **Kiến trúc worker từ xa**: endpoint MinIO và URL callback API được nhúng vào payload tác vụ tại thời điểm phân phối, sử dụng biến môi trường có thể cấu hình theo từng môi trường, tách rời worker khỏi mạng nội bộ Docker.
- **Vòng đời thực nghiệm thống nhất**: FSM sáu trạng thái (PENDING → DOWNLOADING → RUNNING → COMPLETED | FAILED | CANCELLED) với báo cáo callback thời gian thực và tự động tải checkpoint lên khi hoàn thành.
- **Cảnh báo server bận**: UI truy vấn thực nghiệm đang chạy trên mỗi server trước khi nộp tác vụ, hiển thị xung đột cho người dùng mà không chặn việc nộp.

### 1.4 Cấu Trúc Bài Báo

Mục 2 đánh giá các công trình liên quan. Mục 3 mô tả phương pháp và kiến trúc hệ thống. Mục 4 trình bày thiết lập thực nghiệm và kết quả. Mục 5 thảo luận về hạn chế và hướng phát triển tương lai. Mục 6 kết luận.

---

## 2. Các Công Trình Liên Quan

### 2.1 Theo Dõi Thực Nghiệm

**MLflow** [Zaharia et al., 2018] là tiêu chuẩn thực tế cho ghi nhật ký metric và tham số. Nó cung cấp Python SDK, tracking server, và model registry. Tuy nhiên, MLflow không phải là bộ lập lịch tác vụ và không quản lý tập dữ liệu hay tính toán. Nền tảng của chúng tôi tích hợp MLflow như một bộ thu metric (ghi nhật ký theo epoch qua `mlflow.log_metrics`) trong khi cung cấp lớp điều phối mà MLflow còn thiếu.

**Weights & Biases (W&B)** cung cấp trực quan hóa phong phú hơn MLflow nhưng được lưu trữ trên đám mây, đòi hỏi dữ liệu phải rời khỏi tổ chức. **Neptune.ai** và **Comet ML** có cùng hạn chế này. Nền tảng của chúng tôi hoàn toàn tự lưu trữ.

### 2.2 Điều Phối Quy Trình

**Kubeflow Pipelines** [Bisong, 2019] điều phối quy trình ML dạng DAG trên Kubernetes. Chi phí vận hành rất lớn: quản lý cluster Kubernetes, Istio, KFServing, và Argo Workflows đều được yêu cầu. Với các nhóm không có năng lực DevOps chuyên dụng, đây là điều không khả thi. **Apache Airflow** cũng đòi hỏi hạ tầng đáng kể tương tự.

Cách tiếp cận của chúng tôi sử dụng **Celery** với Redis làm broker — một stack nhẹ hơn nhiều, không cần bộ lập lịch cluster trong khi vẫn cung cấp thực thi tác vụ phân tán đáng tin cậy, retry, và giám sát worker.

### 2.3 Quản Lý Tập Dữ Liệu

**DVC (Data Version Control)** [Kuprieiev et al., 2020] cung cấp phiên bản hóa kiểu Git cho các tập dữ liệu lưu trong object storage. DVC tập trung vào hệ thống tệp và vận hành qua CLI, không có giao diện web. Nền tảng của chúng tôi lưu metadata tập dữ liệu (tên, phiên bản, loại nhãn, đường dẫn lưu trữ) trong PostgreSQL và các tệp thực sự trong MinIO, trình bày qua giao diện web với duyệt ảnh và tải lên annotation.

**Hugging Face Datasets** tập trung vào tập dữ liệu NLP và không cung cấp điều phối huấn luyện.

### 2.4 Công Cụ Annotation

**CVAT** [Sekachev et al., 2019] và **Label Studio** là các nền tảng annotation mã nguồn mở hàng đầu. Cả hai đều không tích hợp sẵn với pipeline huấn luyện. Nền tảng của chúng tôi hiện tại nhập tệp COCO JSON do các công cụ bên ngoài tạo ra; tích hợp CVAT (push/pull task) được xác định là công việc tương lai.

### 2.5 Bảng So Sánh

| Tính năng | Nền tảng này | MLflow | Kubeflow | DVC | W&B |
|---|---|---|---|---|---|
| Phiên bản hóa tập dữ liệu | ✓ | — | một phần | ✓ | — |
| Phân phối tác vụ huấn luyện | ✓ | — | ✓ | — | — |
| Theo dõi thực nghiệm | ✓ (qua MLflow) | ✓ | ✓ | — | ✓ |
| Quản lý checkpoint | ✓ | một phần | — | — | — |
| Giao diện web | ✓ | ✓ | ✓ | — | ✓ |
| Tự lưu trữ | ✓ | ✓ | ✓ | ✓ | — |
| Định tuyến GPU đa node | ✓ | — | ✓ | — | — |
| Cài đặt < 10 phút | ✓ | ✓ | — | ✓ | — |

---

## 3. Phương Pháp

### 3.1 Tổng Quan Kiến Trúc Hệ Thống

Nền tảng gồm năm dịch vụ Docker được điều phối bởi Docker Compose:

```
┌─────────────────────────────────────────────────────────────┐
│  Trình duyệt (React 19 + Vite)                              │
│  React Router 7 · Tailwind CSS 4 · TypeScript              │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP REST (cổng 8000)
┌────────────────────▼────────────────────────────────────────┐
│  FastAPI (Python 3.11)                                       │
│  8 router · SQLAlchemy ORM · Pydantic v2                    │
└────┬──────────┬──────────────┬──────────────────────────────┘
     │          │              │
┌────▼───┐ ┌───▼────┐  ┌──────▼──────────────────────────────┐
│Postgres│ │ MinIO  │  │  Redis (broker + result backend)     │
│  15    │ │ S3-API │  └──────┬──────────────────────────────┘
└────────┘ └────────┘         │ Hàng đợi tác vụ Celery
                    ┌─────────▼────────────────────────────────┐
                    │  Training Worker (Celery, PyTorch)        │
                    │  Máy 1 (CPU) · Máy 2 (GPU)               │
                    │  Hàng đợi: celery + server_{id}          │
                    └──────────────────────────────────────────┘
                              │
                    ┌─────────▼────────────────────────────────┐
                    │  MLflow Tracking Server                   │
                    │  Backend SQLite · artifact store cục bộ  │
                    └──────────────────────────────────────────┘
```

*Hình 1: Kiến trúc hệ thống. Mũi tên chỉ hướng luồng dữ liệu.*

### 3.2 Mô Hình Dữ Liệu

Schema PostgreSQL gồm tám bảng:

- **Project**: thực thể gốc; lưu định nghĩa nhãn dưới dạng mảng JSON `[{name, color}]`.
- **DatasetVersion**: ảnh chụp phiên bản của tập dữ liệu; lưu `storage_path` (tiền tố MinIO), `label_type` (`none` | `human`), và số lượng tệp.
- **Trainer**: framework huấn luyện đã đăng ký; lưu schema JSON Pydantic cho `train_params` và `infer_params`.
- **MLModel**: liên kết `Project` với `Trainer`; đại diện cho một họ mô hình (ví dụ: "Pedestrian Detector — YOLO").
- **Checkpoint**: tệp trọng số mô hình đã lưu trong MinIO; `source` là `pretrained` (đã nhập) hoặc `experiment` (do huấn luyện tạo ra).
- **Experiment**: một lần chạy huấn luyện; liên kết `MLModel` + nhiều `DatasetVersion` (qua `ExperimentDataset`); mang `train_params` JSON và `status`.
- **ExperimentDataset**: bảng junction; thêm `role` (TRAIN | VALIDATION | TEST) và `sampling_weight`.
- **Evaluation**: một lần chạy inference của checkpoint trên một hoặc nhiều phiên bản tập dữ liệu; lưu metric theo từng tập và tổng hợp.
- **Server**: node tính toán đã đăng ký; `server_type` (cpu | gpu), `status` (ONLINE | OFFLINE | UNKNOWN), metadata phần cứng.

```
Project ──< DatasetVersion
   │
   └──< MLModel >── Trainer
         │
         └──< Experiment >──< ExperimentDataset >── DatasetVersion
               │
               └──> Checkpoint (pretrained_ckpt_id, output_ckpt_id)

Evaluation >── Checkpoint
Evaluation >── MLModel
```

*Hình 2: Sơ đồ quan hệ thực thể (đơn giản hóa).*

### 3.3 Hệ Thống Plugin Trainer

Thêm một framework huấn luyện mới chỉ cần một tệp: một module Python trong `trainingworker/trainers/` kế thừa `BaseTrainer` và định nghĩa `TRAINER_KEY` cùng `TRAIN_PARAMS_CLASS`.

```
BaseTrainer[TP, IP]          (trừu tượng, generic)
├── TRAINER_KEY: str          "yolo"
├── TRAIN_PARAMS_CLASS        YoloTrainParams
├── fit() → history           vòng lặp huấn luyện (cài trong base)
├── load_dataset()            trừu tượng
├── load_model()              trừu tượng
├── configure_optimizer()     trừu tượng
├── train_step(batch)         trừu tượng
├── evaluate()                trừu tượng
├── save_checkpoint()         trừu tượng
└── load_checkpoint(path)     trừu tượng

BaseTrainParams (Pydantic)
├── epochs, batch_size, learning_rate, weight_decay
├── device: "auto" | "cpu" | "cuda"
└── classes: list[str]        (ui_hidden=True)

YoloTrainParams(BaseTrainParams)
├── model_size: n|s|m|l|x    (ui_group="model")
├── img_size: int             (ui_group="model")
├── augment, mosaic           (ui_group="augmentation")
├── momentum, warmup_epochs   (ui_group="optimizer")
└── iou_threshold, conf_threshold  (ui_group="detection")
```

*Hình 3: Phân cấp lớp trainer và cấu trúc schema tham số.*

Khi container khởi động, `registry.py` quét `trainers/*_trainer.py` tìm các lớp con của `BaseTrainer` và POST schema JSON Pydantic của chúng đến `POST /trainers/register`. API lưu các schema này trong bảng `trainers`. Frontend tải schema của trainer cho model được chọn và render form cấu hình nhóm động: các trường có `ui_hidden: true` bị ẩn; các trường có `ui_group` được nhóm vào các section có thể thu gọn; các trường có `ui_options` render thành `<select>`.

### 3.4 Vòng Đời Thực Nghiệm

```
Người dùng nộp form
       │
       ▼
POST /experiments/
       │ xác thực, lưu trữ
       ▼
celery_app.send_task(
    "tasks.run_experiment",
    queue=f"server_{server_id}"   ← hàng đợi riêng
)
       │
       ▼  Worker nhận tác vụ
  PENDING ──► DOWNLOADING ──► RUNNING ──► COMPLETED
                                     └──► FAILED
                                     └──► CANCELLED
```

*Hình 4: Máy trạng thái thực nghiệm và luồng phân phối.*

Các chuyển đổi trạng thái được báo cáo lại cho API qua callback HTTP nội bộ (`PATCH /experiments/{id}/progress`, `/complete`, `/fail`). Đối tượng context `ProgressReporter` bao gồm các callback này và được inject vào mỗi instance `BaseTrainer`, để trainer gọi `self.reporter.update(epoch, total, metrics)` mà không cần biết về lớp HTTP.

Khi hoàn thành, `ProgressReporter.complete()` tải tệp checkpoint cục bộ lên MinIO tại `checkpoints/project_{id}/exp_{exp_id}/best.pt`, sau đó gọi `/complete` với MinIO key. API tạo bản ghi `Checkpoint` và liên kết với thực nghiệm qua `output_ckpt_id`.

### 3.5 Định Tuyến Worker Đa Máy

Mỗi worker gọi `startup.py` trước khi khởi động Celery. Script khởi động:

1. Poll `GET /health` đến khi API sẵn sàng (xử lý race condition khi khởi động cluster).
2. Gọi `POST /servers/` với tên, host, và số GPU phát hiện được; nếu HTTP 409 (đã đăng ký), patch bản ghi hiện có.
3. Nhận `id` cơ sở dữ liệu của server từ phản hồi API.
4. Thêm `-Q celery,server_{id}` vào lệnh Celery worker trước khi `os.execvp`.

Service thực nghiệm của API xây dựng hàng đợi định tuyến tại thời điểm phân phối:

```python
queue = f"server_{server_id}" if str(server_id).isdigit() else "celery"
celery_app.send_task("tasks.run_experiment", args=[job_payload], queue=queue)
```

Các worker từ xa giao tiếp với MinIO và API sử dụng giá trị endpoint được nhúng trong payload tác vụ, được giải quyết từ biến môi trường `MINIO_WORKER_ENDPOINT` và `API_WORKER_URL` được đặt trên server API. Điều này cho phép các worker trên các máy vật lý khác nhau (kết nối qua VPN overlay Tailscale) nhận tác vụ với địa chỉ endpoint chính xác mà không cần cấu hình thêm ở phía worker.

### 3.6 Bố Cục Lưu Trữ

Tất cả tài sản nhị phân nằm trong MinIO, giữ cho cơ sở dữ liệu quan hệ gọn nhẹ:

```
datasets/
  project_{id}/
    {tên_tập_dữ_liệu}/{phiên_bản}/
      files/          ← ảnh
      annotations/    ← tệp nhãn COCO JSON

checkpoints/
  project_{id}/
    imported/         ← checkpoint pretrained (source=pretrained)
    exp_{exp_id}/     ← kết quả huấn luyện (source=experiment)
```

### 3.7 Chiến Lược Lấy Mẫu

Khi một thực nghiệm tham chiếu nhiều tập dữ liệu TRAIN, `DataContext` hợp nhất chúng bằng một trong ba chiến lược:

- **CONCAT**: các tập dữ liệu được nối thành một `ConcatDataset` PyTorch duy nhất.
- **WEIGHTED**: các mẫu được lấy theo tỷ lệ với giá trị `sampling_weight`, cho phép huấn luyện cân bằng lớp trên các tập dữ liệu có kích thước khác nhau.
- **ROUND_ROBIN**: các batch luân phiên giữa các tập dữ liệu theo thứ tự vòng tròn, đảm bảo mỗi tập dữ liệu đóng góp đều nhau mỗi vòng lặp bất kể kích thước.

---

## 4. Thực Nghiệm

### 4.1 Thiết Lập

Nền tảng được triển khai trên hai máy:

| Node | Vai trò | Phần cứng |
|---|---|---|
| Máy 1 | API, MinIO, Redis, DB, worker cục bộ | Intel i7, 16 GB RAM |
| Máy 2 | GPU training worker | NVIDIA GPU, 8 GB VRAM |

Cả hai máy được kết nối qua VPN overlay Tailscale. Máy 2 chỉ chạy training worker qua `docker-compose.worker.yml`, đặt `network_mode: host` để cho phép định tuyến IP Tailscale. API trên Máy 1 được cấu hình:

```
MINIO_WORKER_ENDPOINT=<tailscale_ip>:9000
API_WORKER_URL=http://<tailscale_ip>:8000
```

Các giá trị này được nhúng vào mọi payload tác vụ gửi đến hàng đợi của Máy 2 (`server_2`), đảm bảo việc tải file từ MinIO và callback báo tiến độ giải quyết đến IP Tailscale công khai của Máy 1 thay vì hostname nội bộ Docker.

### 4.2 Tập Dữ Liệu

Một tập dữ liệu phát hiện đối tượng nhỏ được sử dụng để kiểm tra đầu cuối:

- **Lớp đối tượng**: người đi bộ (1 lớp)
- **Số ảnh**: ~200 ảnh có annotation, định dạng COCO JSON
- **Phân chia**: 140 TRAIN / 30 VALIDATION / 30 TEST

Annotation được tải lên qua endpoint upload-labels của DatasetVersion và lưu trong MinIO tại tiền tố `annotations/`.

### 4.3 Đường Cơ Sở

Do trainer YOLO trong công trình này sử dụng kiến trúc placeholder nhẹ (`_YoloNet`: backbone CNN 3 lớp + detection head 1×1) thay vì mạng YOLOv8/v9 thực sự, các so sánh mAP định lượng với đường cơ sở đã công bố không được báo cáo. Mục tiêu đánh giá chính là tính đúng đắn vận hành và độ tin cậy pipeline đầu cuối của nền tảng.

### 4.4 Kết Quả

**Tính đúng đắn của định tuyến**: Sau khi triển khai định tuyến hàng đợi theo server, 10 thực nghiệm nộp nhắm đến Máy 2 đã được xác minh qua kiểm tra log là được nhận và xử lý hoàn toàn bởi worker Máy 2, không có tác vụ nào bị định tuyến nhầm đến worker cục bộ của Máy 1.

**Giải quyết endpoint**: Trước khi sửa `MINIO_WORKER_ENDPOINT`, 100% thực nghiệm gửi đến Máy 2 thất bại ở giai đoạn DOWNLOADING với lỗi `NameResolutionError: minio:9000`. Sau khi sửa, không có lỗi nào xảy ra ở giai đoạn tải dữ liệu.

**Tải checkpoint**: Một `AssertionError` trong `load_checkpoint()` do gán model vào biến cục bộ thay vì `self.model` đã được xác định và sửa. Sau khi sửa, việc tải checkpoint pretrained thành công trong tất cả các cấu hình được kiểm tra.

**Cảnh báo server bận**: Khi nộp thực nghiệm thứ hai nhắm đến server đang có thực nghiệm đang chạy, UI hiển thị đúng banner cảnh báo trong dropdown chọn server, liệt kê tên và trạng thái của thực nghiệm đang hoạt động, trước khi người dùng nộp form.

**Tích hợp MLflow**: Các metric `train_loss`, `val_loss`, và `mAP50` theo từng epoch hiển thị trong UI MLflow tại tên thực nghiệm `project_{id}`, với mỗi lần chạy huấn luyện xuất hiện như một MLflow run riêng (`exp_{id}`).

### 4.5 Phân Tích

Độ trễ chính khi khởi động thực nghiệm là tải tập dữ liệu từ MinIO, tỉ lệ với kích thước tập dữ liệu. Với tập 200 ảnh qua kết nối Tailscale, tải hoàn thành trong dưới 8 giây. Hàng đợi tác vụ Celery thêm chi phí không đáng kể (<1 giây) cho định tuyến tác vụ.

Cơ chế định tuyến dựa trên hàng đợi có một ràng buộc: tên hàng đợi của worker được cố định trong suốt vòng đời tiến trình. Nếu ID cơ sở dữ liệu của server thay đổi (ví dụ sau khi đăng ký lại với tên khác), API sẽ gửi đến hàng đợi mà worker không còn lắng nghe. Script khởi động xử lý điều này bằng cách patch thay vì tạo lại bản ghi server khi nhận HTTP 409 Conflict, giữ nguyên `id` gốc qua các lần khởi động lại.

---

## 5. Thảo Luận

### 5.1 Ý Nghĩa

Nền tảng chứng minh rằng một pipeline huấn luyện ML cấp production có thể được lắp ráp từ các thành phần mã nguồn mở trưởng thành (FastAPI, Celery, MinIO, PostgreSQL, MLflow) mà không cần độ phức tạp vận hành của Kubernetes. Cầu nối schema Pydantic sang UI đặc biệt thực tiễn: thêm trainer ResNet, ViT, hay bất kỳ kiến trúc nào khác không cần code frontend, giảm tác vụ "thêm loại model mới" từ một nỗ lực liên nhóm xuống còn một tệp backend duy nhất.

Kiến trúc worker từ xa qua VPN là đóng góp có ý nghĩa cho các tổ chức có phần cứng GPU nội bộ nhưng cần điều phối từ một server trung tâm: không cần mở cổng tường lửa ngoài tunnel VPN, và mô hình bảo mật giống hệt triển khai một máy.

### 5.2 Hạn Chế

**Triển khai YOLO placeholder**: `YoloTrainer` hiện tại sử dụng CNN ba lớp thay vì backbone YOLO thực sự. Tính toán mAP thực sự qua `torchmetrics` hoặc `pycocotools` được stub bằng giá trị zero. Đây là scaffolding có chủ đích — interface plugin là đúng và backbone YOLO thực có thể được thay thế mà không cần thay đổi API hay frontend — nhưng có nghĩa là kết quả huấn luyện không có ý nghĩa cho các tác vụ phát hiện thực tế.

**Không có streaming log thời gian thực**: Nhật ký huấn luyện chỉ có thể truy cập qua `docker logs`. Không có luồng WebSocket hay SSE để hiển thị chúng trong UI. Người dùng theo dõi các lần chạy huấn luyện dài phải dùng terminal.

**Một checkpoint mỗi thực nghiệm**: Nền tảng lưu một checkpoint (`best.pt`) cho mỗi thực nghiệm. Các checkpoint epoch trung gian không được quản lý. Các lần chạy huấn luyện dài bị gián đoạn không thể tiếp tục từ checkpoint giữa chừng.

**Không có giao diện annotation**: Việc nhập annotation đòi hỏi công cụ bên ngoài (Label Studio, CVAT) để tạo COCO JSON, sau đó được tải lên qua API. Không có khả năng gán nhãn ảnh trong nền tảng.

**Không mở rộng API theo chiều ngang**: API là một tiến trình FastAPI đơn. Dưới tải cao từ nhiều worker đồng thời gửi callback tiến độ, đây có thể trở thành điểm nghẽn cổ chai.

### 5.3 Hướng Phát Triển Tương Lai

**Dashboard trực quan hóa**: Triển khai biểu đồ metric theo từng thực nghiệm (đường cong train loss, tiến trình mAP theo epoch) trực tiếp trong trang Experiments, lấy dữ liệu từ REST API của MLflow hoặc lưu metric theo epoch trong cơ sở dữ liệu nền tảng. Điều này loại bỏ nhu cầu điều hướng đến URL MLflow riêng biệt để kiểm tra metric và làm cho tiến trình huấn luyện trở nên dễ đọc hơn với các bên liên quan không có kiến thức kỹ thuật, không cần truy cập terminal.

**Tích hợp CVAT**: Tích hợp với REST API của CVAT để hỗ trợ quy trình annotation push-pull: người dùng đẩy `DatasetVersion` chưa có nhãn vào một CVAT task, người gán nhãn đánh dấu ảnh trong giao diện chuyên dụng của CVAT, và các annotation hoàn thành được kéo về nền tảng và gắn vào phiên bản tập dữ liệu tự động. Điều này sẽ lấp đầy khoảng trống annotation mà không cần đăng nhập riêng hoặc xuất JSON thủ công, tạo ra vòng lặp dữ liệu liên tục: huấn luyện → đánh giá → xác định trường hợp thất bại → gán nhãn → huấn luyện lại.

**Backbone YOLO thực sự**: Thay `_YoloNet` bằng backbone YOLOv8/v9 thực sự sử dụng thư viện Ultralytics. Triển khai tính toán mAP đúng trong `evaluate_dataset()` sử dụng `torchmetrics.detection.MeanAveragePrecision` với ngưỡng IoU chuẩn COCO.

**Streaming log**: Thêm endpoint WebSocket (`GET /experiments/{id}/logs/stream`) theo dõi log Celery worker và chuyển tiếp chúng đến trình duyệt theo thời gian thực.

**Quản lý đa checkpoint**: Lưu các checkpoint trung gian (mỗi N epoch) trong MinIO và hiển thị chúng như các bản ghi `Checkpoint` với `source=experiment_intermediate`, cho phép tiếp tục thực nghiệm và chọn checkpoint mục tiêu để đánh giá.

---

## 6. Kết Luận

Bài báo này trình bày một nền tảng MLOps tự lưu trữ cho thị giác máy tính tích hợp phiên bản hóa tập dữ liệu, điều phối huấn luyện phân tán, theo dõi thực nghiệm, quản lý checkpoint, và giám sát node tính toán thành một stack triển khai duy nhất. Các quyết định kiến trúc chính — đăng ký trainer dựa trên schema, định tuyến hàng đợi Celery theo worker, và giải quyết endpoint nhúng trong payload — cùng nhau tạo ra một quy trình trong đó thêm framework huấn luyện mới chỉ cần một tệp, chỉ định huấn luyện đến một máy cụ thể chỉ cần một lần chọn dropdown, và điều phối worker qua các máy vật lý chỉ cần kết nối VPN và hai biến môi trường.

Nền tảng đã được triển khai và kiểm tra trong cấu hình hai máy với một CPU server và một GPU worker kết nối qua VPN Tailscale, giải quyết ba loại lỗi production được xác định trong quá trình sử dụng thực tế: rò rỉ hostname nội bộ Docker đến worker từ xa, lỗi thứ tự gán model trong tải checkpoint, và định tuyến tác vụ sai do dùng chung tên hàng đợi Celery. Kết quả là một hệ thống có thể tái hiện, khép kín, phù hợp cho các nhóm thị giác máy tính vừa và nhỏ hoạt động trong môi trường nhạy cảm về dữ liệu hoặc bị ràng buộc tài nguyên.

Việc tích hợp CVAT cho quản lý annotation và trực quan hóa metric trong nền tảng trong tương lai sẽ hoàn thiện vòng lặp phản hồi dữ liệu-đến-mô hình, loại bỏ các bước chuyển giao thủ công còn lại trong quy trình ML thị giác máy tính.

---

## Tài Liệu Tham Khảo

- Zaharia, M., et al. (2018). *Accelerating the Machine Learning Lifecycle with MLflow*. IEEE Data Engineering Bulletin.
- Bisong, E. (2019). *Kubeflow and Kubeflow Pipelines*. Trong Building Machine Learning and Deep Learning Models on Google Cloud Platform. Apress.
- Kuprieiev, R., et al. (2020). *DVC: Data Version Control — Git for Data & Models*. Zenodo. doi:10.5281/zenodo.3677553
- Sekachev, B., et al. (2019). *Computer Vision Annotation Tool (CVAT)*. Zenodo. doi:10.5281/zenodo.4009388
- Jocher, G., et al. (2023). *Ultralytics YOLOv8*. GitHub. https://github.com/ultralytics/ultralytics
- Lin, T.-Y., et al. (2014). *Microsoft COCO: Common Objects in Context*. ECCV 2014. Springer.
- Paszke, A., et al. (2019). *PyTorch: An Imperative Style, High-Performance Deep Learning Library*. NeurIPS 2019.
- FastAPI. (2023). *FastAPI framework, high performance, easy to learn*. https://fastapi.tiangolo.com
