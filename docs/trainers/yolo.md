# YOLO Object Detection

**Key**: `yolo` · **Library**: [Ultralytics YOLOv8](https://docs.ultralytics.com)

Trainer phát hiện đối tượng (object detection) — dự đoán bounding box + class cho từng object trong ảnh.
Phù hợp với bài toán đếm, định vị, theo dõi đối tượng.

---

## Dataset format

Dataset phải ở **YOLO format** với cấu trúc thư mục sau:

```
dataset/
├── images/
│   ├── img001.jpg
│   └── img002.jpg
└── labels/
    ├── img001.txt
    └── img002.txt
```

Mỗi file `.txt` là một file nhãn, mỗi dòng là một object:

```
<class_id> <cx> <cy> <width> <height>
```

Tất cả tọa độ được chuẩn hóa về `[0, 1]` theo chiều rộng/cao ảnh.

> **Upload lên hệ thống**: Đặt toàn bộ `images/` vào phần **Files**, toàn bộ `labels/` vào phần **Annotations**. Tên file label phải trùng với tên file ảnh (chỉ khác đuôi).

---

## Chọn model size

| Size | Params | Tốc độ | Dùng khi |
|------|--------|--------|----------|
| `n` (nano) | ~3M | Rất nhanh | Dataset nhỏ, inference real-time, thử nghiệm |
| `s` (small) | ~11M | Nhanh | Cân bằng tốt cho hầu hết bài toán |
| `m` (medium) | ~26M | Trung bình | Object nhỏ, cần độ chính xác cao hơn |
| `l` (large) | ~43M | Chậm | Dataset lớn, bài toán phức tạp |
| `x` (extra-large) | ~68M | Rất chậm | Accuracy tối đa, có GPU mạnh |

Khuyến nghị bắt đầu với `n` hoặc `s` để kiểm tra pipeline, sau đó scale up.

---

## Tham số quan trọng

### Model
| Tham số | Mặc định | Mô tả |
|---------|----------|-------|
| `model_size` | `n` | Kích thước model: n/s/m/l/x |
| `img_size` | `640` | Kích thước ảnh (px). Phải chia hết cho 32. Ảnh sẽ được resize về giá trị này |

### Augmentation
| Tham số | Mặc định | Mô tả |
|---------|----------|-------|
| `augment` | `true` | Bật tất cả augmentation (mosaic, flip, HSV shift) |
| `mosaic` | `1.0` | Xác suất ghép 4 ảnh thành 1 (mosaic). Giảm xuống 0.0 nếu layout ảnh quan trọng |

### Optimizer (SGD + Cosine LR)
| Tham số | Mặc định | Mô tả |
|---------|----------|-------|
| `learning_rate` | `0.01` | Learning rate ban đầu |
| `momentum` | `0.937` | SGD momentum |
| `warmup_epochs` | `3` | Số epoch tăng dần LR từ 0 lên `learning_rate` |
| `lr_final` | `0.01` | Tỉ lệ LR cuối so với ban đầu (cosine decay) |
| `weight_decay` | `0.0005` | L2 regularization |

### Regularization
| Tham số | Mặc định | Mô tả |
|---------|----------|-------|
| `dropout` | `0.0` | Dropout ở classification head. Tăng nếu overfitting |
| `patience` | `50` | Early stopping: dừng nếu mAP50 không cải thiện sau N epoch |

### Detection
| Tham số | Mặc định | Mô tả |
|---------|----------|-------|
| `iou_threshold` | `0.7` | IoU threshold cho NMS khi training |

---

## Metrics

| Metric | Mô tả |
|--------|-------|
| `mAP50` | Mean Average Precision tại IoU=0.50 — metric chính để đánh giá |
| `mAP50_95` | mAP trung bình từ IoU=0.50 đến 0.95 (khắt khe hơn) |
| `precision` | Trong các box được predict là object, bao nhiêu % đúng |
| `recall` | Trong các object thực tế, bao nhiêu % được detect |

---

## Tips

- **Pretrained checkpoint**: Dùng checkpoint YOLOv8 pretrained (`.pt`) từ Ultralytics làm điểm xuất phát — hội tụ nhanh hơn nhiều so với train từ đầu.
- **img_size**: Nếu object nhỏ, tăng `img_size` lên 1280. Nếu bị OOM, giảm `batch_size` xuống.
- **mosaic=0**: Dataset y tế, ảnh toàn cảnh, hoặc khi vị trí object quan trọng — nên tắt mosaic.
- **Overfitting**: Tăng `dropout`, giảm `epochs`, tắt `augment` chỉ để debug, không để train thật.
